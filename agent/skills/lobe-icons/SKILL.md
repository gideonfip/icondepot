---
name: lobe-icons (Agent Skill)
description: >
  Use @lobehub/icons — 200+ AI/LLM brand SVG logos and React icon components.
  Covers: installation, CDN URL generation, React component usage (Color, Brand, Text,
  Combine, Avatar variants), ModelIcon/ProviderIcon helpers, table-of-contents (toc)
  metadata, and custom icon creation via IconType.
  Use when working with AI brand logos, model/provider icons, or needing icon assets
  in SVG/PNG/WebP format from the lobehub ecosystem.
  Trigger: "lobe icons", "@lobehub/icons", "sync lobe icons", "AI provider icons".
---

# Lobe Icons — Agent Skill

200+ AI / LLM brand SVG logo and icon collection as React components with CDN static asset support.

- **Package**: `@lobehub/icons`
- **Browse all icons**: [lobehub.com/icons](https://lobehub.com/icons)
- **Component docs**: [icons.lobehub.com](https://icons.lobehub.com)
- **GitHub**: [github.com/lobehub/lobe-icons](https://github.com/lobehub/lobe-icons)

## Installation

```bash
npm install @lobehub/icons
# or
bun add @lobehub/icons
```

## React Components

Each icon exports a base component and variant sub-components:

```tsx
import { OpenAI } from '@lobehub/icons';

// Base (mono)
<OpenAI size={24} />

// Variants
<OpenAI.Color size={24} />       // hasColor
<OpenAI.Brand size={24} />       // hasBrand
<OpenAI.BrandColor size={24} />   // hasBrandColor
<OpenAI.Text size={32} />         // hasText
<OpenAI.TextCn size={32} />       // hasTextCn
<OpenAI.TextColor size={32} />    // hasTextColor
<OpenAI.Combine size={64} />      // hasCombine
<OpenAI.Combine size={64} type="color" />
<OpenAI.Avatar size={64} />       // hasAvatar
```

Common props: `size`, `style`, `className`.

### Available Icon Names

Icons are exported by PascalCase id. Examples: `OpenAI`, `Claude`, `DeepSeek`, `Google`,
`Anthropic`, `Gemini`, `Mistral`, `Cohere`, `Perplexity`, `HuggingFace`, `Groq`,
`TogetherAI`, `Cerebras`, `FireworksAI`, `Hyperbolic`, `KiloCode`, etc.

For the full list, see `reference/providers.md` or the toc.

## Helper Components

### ModelIcon — Render icon by model ID string

```tsx
import { ModelIcon } from '@lobehub/icons';

<ModelIcon model="gpt-4o" size={24} />
<ModelIcon model="claude-3-opus" size={24} />
```

### ProviderIcon — Render icon by provider key

```tsx
import { ProviderIcon } from '@lobehub/icons';

<ProviderIcon provider="openai" size={28} type="mono" />
<ProviderIcon provider="anthropic" size={28} type="color" />
```

### ProviderCombine — Logo + text combined

```tsx
import { ProviderCombine, ModelProvider } from '@lobehub/icons';

<ProviderCombine provider={ModelProvider.OpenAI} size={32} type="mono" />
<ProviderCombine provider="anthropic" size={32} type="color" />
```

### ModelProvider enum

```tsx
import { ModelProvider } from '@lobehub/icons';

ModelProvider.OpenAI;    // "openai"
ModelProvider.Anthropic; // "anthropic"
ModelProvider.Google;    // "google"
ModelProvider.DeepSeek;  // "deepseek"
// ... 130+ providers
```

## CDN URLs (Static Assets)

Use `getLobeIconCDN` to generate direct URLs:

```tsx
import { getLobeIconCDN } from '@lobehub/icons';

// Default: SVG, color variant, GitHub CDN
getLobeIconCDN('openai');
// → https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/icons/openai-color.svg

getLobeIconCDN('openai', {
  format: 'svg',     // 'svg' | 'png' | 'webp' | 'avatar'
  type: 'mono',       // 'mono' | 'color' | 'text' | 'text-cn' | 'brand' | 'brand-color'
  isDarkMode: true,   // affects PNG/WebP path (dark/ vs light/)
  cdn: 'github',      // 'github' (default) | 'aliyun' | 'unpkg'
});
```

### CDN URL Patterns

**SVG** (no light/dark distinction):

```
# GitHub
https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/icons/{id}.svg
https://raw.githubusercontent.com/.../icons/{id}-color.svg
https://raw.githubusercontent.com/.../icons/{id}-text.svg

# unpkg
https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{id}.svg
```

**PNG/WebP** (with light/dark):

```
https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/{light|dark}/{id}.png
https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/{light|dark}/{id}-color.png
```

## Icon Table of Contents (toc)

```tsx
import { toc } from '@lobehub/icons';
// toc: IconToc[]
```

```typescript
interface IconToc {
  id: string;         // PascalCase identifier, e.g. "OpenAI"
  title: string;      // Short name, e.g. "openai"
  fullTitle: string;  // Full display name
  color: string;      // Brand hex color
  colorGradient?: string;
  desc: string;       // Official URL
  docsUrl: string;
  group: 'model' | 'provider' | 'application';
  param: {
    hasColor: boolean;
    hasText: boolean;
    hasTextCn: boolean;
    hasTextColor: boolean;
    hasBrand: boolean;
    hasBrandColor: boolean;
    hasCombine: boolean;
    hasAvatar: boolean;
  };
}
```

## Custom Icons with IconType

```tsx
import { type IconType, useFillIds } from '@lobehub/icons';
import { memo } from 'react';

const MyIcon: IconType = memo(({ size = '1em', style, ...rest }) => {
  const [maskA, maskB] = useFillIds('my-icon', 2);
  return (
    <svg
      height={size}
      width={size}
      viewBox="0 0 24 24"
      style={{ flex: 'none', lineHeight: 1, ...style }}
      {...rest}
    >
      {/* SVG content */}
    </svg>
  );
});
```

## Sync with This Repo

To sync lobe-icons into the local icon database:

```bash
# Dry run — see what would change
node scripts/sync-lobe-icons.mjs

# Actually download and write files
node scripts/sync-lobe-icons.mjs --apply

# Normalize (dedupe, fix metadata, tag sources)
node scripts/normalize.mjs --apply

# Both in one shot
npm run sync:lobe
```

## Related Packages

| Package                      | Use case                         |
| ---------------------------- | -------------------------------- |
| `@lobehub/icons`             | React components (tree-shakable) |
| `@lobehub/icons-rn`          | React Native                     |
| `@lobehub/icons-static-svg`  | Static SVG files                 |
| `@lobehub/icons-static-png`  | Static PNG files (light/dark)    |
| `@lobehub/icons-static-webp` | Static WebP files (light/dark)   |
