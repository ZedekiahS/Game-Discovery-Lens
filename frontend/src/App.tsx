import { ArrowLeft, Gamepad2, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LanguageProvider, useI18n } from "./i18n";
import { useAccount } from "./hooks/useAccount";
import { useCollections } from "./hooks/useCollections";
import { useDiscovery } from "./hooks/useDiscovery";
import { DATA_MODE } from "./services/runtime";
import { AccountPanel } from "./components/AccountPanel";
import { CollectionsPanel } from "./components/CollectionsPanel";
import { SaveGameMenu } from "./components/SaveGameMenu";
import { GameWorkspace } from "./components/GameWorkspace";
import { HomePage } from "./components/HomePage";
import { usePage, type AppPage, type WorkspaceView } from "./hooks/usePage";
import { usePlayerLibrary } from "./hooks/usePlayerLibrary";
import { PlayerLibraryPage } from "./components/PlayerLibraryPage";
import { PlayerProfilePage } from "./components/PlayerProfilePage";
import "./components/player-pages.css";

export default function App() {
  return <LanguageProvider><GameDiscoveryApp /></LanguageProvider>;
}

function GameDiscoveryApp() {
  const { language, setLanguage, t } = useI18n();
  const page = usePage();
  const pageContent = useRef<HTMLDivElement>(null);
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    const heading = pageContent.current?.querySelector<HTMLElement>("main h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [page]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark"><Gamepad2 size={22} aria-hidden="true" /></div>
          <div><h1>Game Discovery <span>Lens</span></h1><p>{t("Discover games. Read the signals.", "发现游戏，读懂信号")}</p></div>
        </div>
        <div className="runtime-info">
          <div className="language-switch" role="group" aria-label={t("Interface language", "界面语言")}>
            <Languages size={16} aria-hidden="true" />
            <button type="button" lang="zh-CN" aria-label="中文" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>中文</button>
            <button type="button" lang="en" aria-label="English" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
          </div>
        </div>
      </header>
      <div ref={pageContent}>
        {page ? <WorkspaceSession key={page === "developer" ? "developer" : "player"} view={page === "developer" ? "developer" : "player"} page={page} /> : <HomePage />}
      </div>
    </div>
  );
}

function WorkspaceSession({ view, page }: { view: WorkspaceView; page: AppPage }) {
  const { t } = useI18n();
  const account = useAccount();
  const discovery = useDiscovery(view);
  const sessionUserId = DATA_MODE === "demo" ? "demo-user" : account.user?.id ?? null;
  const collections = useCollections(discovery.catalog, sessionUserId, account.revision, view === "player" ? "player" : "research");
  const library = usePlayerLibrary(view === "player" ? sessionUserId : null, account.revision);
  const [recordGameId, setRecordGameId] = useState<number | null>(null);
  const sessionKey = `${sessionUserId ?? "anonymous"}:${account.revision}`;

  return <>
      <nav className="workspace-navigation" aria-label={t("Page navigation", "页面导航")}>
        <a href="#home"><ArrowLeft size={15} aria-hidden="true" />{t("Home", "首页")}</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{view === "developer" ? t("Developer research", "开发者研究") : t("Player discovery", "玩家探索")}</span>
        {view === "player" && <div className="player-navigation">
          <a href="#player" aria-current={page === "player" ? "page" : undefined}>{t("Discover", "发现游戏")}</a>
          <a href="#player/library" onClick={() => setRecordGameId(null)} aria-current={page === "library" ? "page" : undefined}>{t("My games", "我的游戏库")}</a>
          <a href="#player/profile" aria-current={page === "profile" ? "page" : undefined}>{t("My taste", "玩家画像")}</a>
        </div>}
      </nav>
      {(page === "library" || page === "profile") ? <div key={sessionKey}>
        {DATA_MODE === "api" && <div className="player-account"><AccountPanel account={account} /></div>}
        {page === "library" ? <PlayerLibraryPage catalog={discovery.catalog} catalogLoading={discovery.catalogLoading} catalogError={discovery.catalogError} retryCatalog={discovery.retryCatalog} library={library} collections={collections} userId={sessionUserId} startGameId={recordGameId} />
          : <PlayerProfilePage catalog={discovery.catalog} catalogLoading={discovery.catalogLoading} catalogError={discovery.catalogError} retryCatalog={discovery.retryCatalog} library={library} collections={collections} userId={sessionUserId} />}
      </div> : <GameWorkspace
        discovery={discovery}
        renderSaveMenu={(game) => <><SaveGameMenu
          key={`${sessionKey}:${game.id}`}
          state={collections}
          sessionUserId={sessionUserId}
          game={game}
        />{view === "player" && <button type="button" className="small-button" onClick={() => { setRecordGameId(game.id); window.location.hash = "#player/library"; }}>{t("Track this game", "记录这款游戏")}</button>}</>}
        collectionPanel={<aside className="sidebar" aria-label={t("Your account and collections", "你的账号与收藏")}>
          {DATA_MODE === "api" && <AccountPanel account={account} />}
          <CollectionsPanel
            key={sessionKey}
            state={collections}
            sessionUserId={sessionUserId}
            selectedId={discovery.selectedId}
            onSelectGame={discovery.selectGame}
            view={view}
          />
        </aside>}
      />}
  </>;
}
