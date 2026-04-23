# Bohrium Web - Cursor Rules

Bohrium Web 项目的前端开发规范。

## 📚 规则列表

| 文件 | 描述 | 适用范围 |
|------|------|----------|
| [code-style.mdc](mdc:code-style.mdc) | 代码风格和质量规范 | 所有文件 |
| [architecture.mdc](mdc:architecture.mdc) | 架构开发规范 | *.ts, *.tsx |
| [typescript.mdc](mdc:typescript.mdc) | TypeScript 编码规范 | *.ts, *.tsx |
| [react-nextjs.mdc](mdc:react-nextjs.mdc) | React/Next.js 完整开发规范 | *.ts, *.tsx |
| [component-design.mdc](mdc:component-design.mdc) | 组件设计规范（SSR 优化） | *.tsx |
| [performance.mdc](mdc:performance.mdc) | 性能劣化规避与检查判断 | 所有文件 |
| [style.mdc](mdc:style.mdc) | 样式编写规范 | *.scss, *.less, *.css |
| [ai-generated-code-annotation.mdc](mdc:ai-generated-code-annotation.mdc) | ai生成代码注释规范 | 所有文件 |

## 🎯 项目信息

### 技术栈
- **架构**: Monorepo (pnpm workspace)
- **语言**: TypeScript
- **框架**: React 18+ / Next.js
- **样式**: SCSS, Less
- **构建**: Vite, Next.js
- **规范**: Biome (domains/next-app), ESLint (space)

### 包结构
```
bohrium-space/        # 主应用 (Vite + React)
bohrium-next-app/     # Next.js SSR 应用
bohrium-domains/      # 业务逻辑层
bohrium-shared/       # 共享组件库
```


