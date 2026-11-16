# Game Discovery Lens: Making a Game-Discovery Application Reliable

**Portfolio version frozen on 2026-11-16 / 作品集功能版本于 2026-11-16 冻结。** The [bilingual root README](../README.md) is the project entry point; this case study retains the engineering evidence rather than a future product roadmap.

<details>
<summary><strong>中文工程回顾：原项目、个人后续重构与 AI 辅助范围</strong></summary>

原项目是 Java Swing + SQL Server 的小组课程作业：窗口经 JDBC 调用表、视图和存储过程，包含游戏、玩家、开发者、购买、评论、礼包与代金券等业务。旧代码保留在 `UI/`、根目录 `migrations/`、`Views/` 等目录；不能将全部原始模块归为个人成果。

后续个人重构由维护者主导需求、取舍与验收，借助 AI 编码工具完成分析、实现、测试、排错及文档。现代版重新建立 React/TypeScript 前端、FastAPI API、PostgreSQL 模型与迁移，独立于学校数据库运行；保留游戏领域，收窄为发现、搜索、收藏、个人记录、偏好和研究参考，并非逐行转换 Java 或迁移全部历史功能。

改造重点是可验证的行为：服务端根据 token 判断所有者；旧响应不能覆盖新会话；游戏记录与偏好带版本保存；冲突保留草稿；提交后丢失响应要先读取核对，不能自动重试写入。搜索修正标题／预算、完整中文类型词与序数的冲突，并让 API、本地筛选和 URL 恢复得到一致结果。首次进入玩家页面从推荐开始，收藏、游玩记录和喜好是不同事实。

AI 辅助开发不等于所有功能都在运行时调用 AI。可选 DeepSeek 仅解释搜索条件，应用校验后执行数据库查询；画像和推荐采用可解释规则，洞察目前依据目录而非评论原文。测试中的模型响应受控；历史付费评测有单独记录。固定场景通过率不是通用模型准确率，也不是实际玩家满意度。

验证包含隔离数据库、自动化真实 API 流程、实际 Docker 镜像及构建后的前端，还有桌面英文／移动中文 Computer Use。一次 Docker 缺文件怀疑被真实构建证伪，记录已明确更正；注册按钮问题则通过真实指针事件复现并修复。这些失败和更正与通过结果一起保留。[交付与并发证据](verification/delivery-preferences-search-2026-11-15.md) · [最终收尾](verification/portfolio-freeze-2026-11-16.md)

这是一份作品集工程案例：80 款样例游戏的数值指标是合成值，不主张真实市场研究能力，不再继续开发为商业产品。下面英文部分保留具体实现与历史评测细节。

</details>

Game Discovery Lens began as group coursework built with Java Swing and SQL Server. This case study covers the subsequent React/TypeScript, FastAPI, and PostgreSQL refactor. The original application remains as project history; its group authorship is distinct from the modern implementation described here.

The goal is a portfolio application with inspectable engineering decisions: predictable search, account-owned collections, honest failure states, and bounded AI integration. The web application runs independently of the original school database.

The subsequent individual modernization was directed by the maintainer, with AI coding assistance for analysis, implementation, tests, debugging and documentation. This is not a claim of sole authorship of the coursework or an entirely hand-written modern codebase. Scope decisions and acceptance are supported by the recorded checks and interaction reviews; AI output alone is not treated as proof.

## Engineering Changes with Observable Consequences

**1. Saving belongs to the authenticated account.** Before the ownership correction, requests could read saved games using a supplied `userId` without authentication. Regression tests reproduced that behavior against an isolated PostgreSQL schema. Collection and saved-game routes now derive ownership from the bearer token, reject forged body-owner fields, and hide another account's collections.

Persistence also needs an honest failure path. In the browser acceptance check, stopping the API during a save produced a visible failure and a reload action. It preserved API mode and the existing saved count. Restarting the API allowed recovery, and refreshing restored the account's saved games. [Ownership and persistence evidence](verification/collections-2026-09-14.md) documents the reproductions and fixes.

**2. A search result must answer the current request.** Previously, `Celeste` and an unknown title both produced unrestricted intents with an implicit price ceiling. Decimal budgets could also lose precision. The refactor introduced nullable literal title and budget constraints, combined with tags, rating, and review eligibility. SQL escapes `%` and `_` in title searches.

Correct parsing is only part of correctness: a slow earlier request must not overwrite a newer search or manual filter. Discovery and detail hooks guard response order and selected-game identity. Account and collection hooks apply equivalent session guards. These boundaries keep delayed results from restoring stale selections or another session's data. [Search verification](verification/search-2026-09-14.md) records the triggering failures and regression coverage.

**3. Entering as a player starts with discovery.** An earlier screen opened with a prefilled second-most-expensive FPS query. The homepage now offers player and developer perspectives: recommendations for players, a catalog overview for developers, and search on demand. The perspectives do not change account permissions. English/Chinese presentation preserves canonical identifiers, user-written collection names, and provider text. Page composition, navigation, translations, and data adapters have separate responsibilities in the [architecture](architecture.md).

**4. Personalization follows explicit, inspectable evidence.** Players maintain a library of play statuses, preferences, and notes. Personal collections are distinct from research references, and the profile counts unique games rather than inventing playtime. Homepage recommendations use explicit wishlist/preference tiers, weaker interest/history evidence, hard avoidance rules, and concrete reasons. Cold start and failed preference loading remain usable without being presented as personalized success. Explicit search can still find an excluded game. [Verification](verification/personalized-recommendations-2026-10-15.md) covers account transitions, delayed responses, and the regression where saving a game unexpectedly reset the featured selection. This provides a testable baseline before spending on additional model calls or claiming recommendation quality.

## AI with a Testable Boundary

AI assistance in the development process is separate from the optional runtime provider described here.

The optional DeepSeek provider translates a query into a normalized search intent. SQLAlchemy constructs the database filters and ranking. Responses identify `deepseek` or `rules`; provider failures follow the configured fallback policy. Normalization validates structure and supported values, but does not establish that the interpretation matches the user's request.

A small catalog can hide that distinction. Treating “free” as a title fragment might accidentally return the only free game. The separate [boundary fixture](../tests/fixtures/search-evaluation-boundaries.json) adds 16 synthetic games and 10 manually specified queries, including a paid “Fixture Freeport,” prices of $19.99/$20/$20.01, tied prices, zero reviews with a high rating, and similar titles. Expected intents and ordered game IDs expose semantic and execution mistakes separately. These are test records, not market data.

The [first live evaluation](verification/ai-evaluation-2026-09-15.md) exposed this distinction: only 24/31 nonblank DeepSeek integration cases met both the checked intent fields and ordered SQL results. The prompt omitted the product's US$35 cheap default and 4.4 high-rating threshold. A rules title guard could also contaminate a valid zero-price interpretation by adding `free` as a title fragment. The original reports are retained as evidence of those failures.

The correction makes the product contract executable. Rules recognize free/free-to-play/免费 as a zero-price condition, explicit budgets override the cheap default, and high-rating queries require a positive review count. Known and quoted titles are extracted before conditions are interpreted. The provider prompt states these conventions and supplies catalog titles; code then enforces recognized price, rating, and review conditions on the normalized intent. The [new live run](verification/search-fixes-2026-09-16.md) passed 31/31 of the same nonblank cases with no observed fallbacks. This measures the combined application and provider, not the model's raw accuracy or an advantage over rules.

Eight independently formulated follow-up queries initially scored 7/8 for both paths. Their sole mismatch was an authored expectation: `cheap ... under 20 dollars` had been assigned default name ordering, even though price-ascending ordering already existed before the repair. The original output was preserved, the expectation was corrected using the earlier implementation and tests, and the recorded outputs were rescored to 8/8 in a separate artifact without another provider call. This is a small independent formulation check, not a general held-out benchmark. The correction history matters as much as the final count.

Automated tests, isolated PostgreSQL checks, browser failure exercises, and build checks provide complementary evidence. This remains a portfolio demonstration: current insights summarize catalog metadata, live market accuracy is unverified, and logout clears the browser session without server-side token revocation.

The [October 29 calibration](verification/tag-semantics-recommendations-2026-10-29.md) makes a narrower recommendation claim: on frozen editorial scenarios, concrete gameplay prioritization and consistent type exclusions improve diagnostic scores. The record preserves an intermediate Ori regression and a lower score caused by correctly excluding a co-op game. No labels were changed to hide those results. These small authored fixtures are useful regression evidence, not independent proof of player satisfaction.

## Delivery and Closure

The [November 15 record](verification/delivery-preferences-search-2026-11-15.md) closes stale preference overwrites with atomic version checks and retains original-account drafts through conflicts/expiry. Shared phrase/order fixtures align API search with local filtering and URL restoration. A separate CI job builds the actual image and frontend, then registers, searches, saves and reloads against a disposable database. The suspected missing Docker resource was disproved by a real baseline build; the improvement is explicit packaging and artifact verification, not a repaired startup crash.

The [November 16 closure](verification/portfolio-freeze-2026-11-16.md) fixes the first-click registration issue with a failing-then-passing browser regression, documents the bilingual repository entry point, and freezes feature development. Earlier future-work discussions remain historical limitations, not an active roadmap. No public production readiness, live market accuracy or physical-device coverage is claimed.
