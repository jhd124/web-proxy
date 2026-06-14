# breakpoints/hooks

`breakpoints/hooks/` 管理断点模块的状态逻辑。

## 当前 Hook

- `useBreakpointState.ts`：断点列表与交互状态管理（含选中断点 `selectedBreakpointId`、新建表单激活态 `isBreakpointFormActive` 与 `startNewBreakpoint` 重置逻辑；新建表单 `matchMethod` 默认值为 `GET`）；`saveBreakpoint` 统一处理“新建（POST）/更新（PUT）”，并在命中后端唯一性约束（HTTP 409）时统一使用 toast 提示重复规则（相同 method+origin+path）。保存时支持 origin fallback（例如从 traffic 进入 breakpoints 且表单 origin 为空时，自动写入当前选中请求的 origin）；`addBreakpointFromOverride` 只负责回填新表单并打开面板，不再自动创建规则。

## 维护要求

新增 Hook 或调整断点状态职责时，必须同步更新本文件。
