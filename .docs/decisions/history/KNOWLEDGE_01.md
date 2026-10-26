### 1. Планирование и инициализация проекта

**1.1. Создание проекта**
- Создать директорию для проекта:
```bash
mkdir opencode_mosp
cd opencode_mosp
```
- Инициализация проекта с использованием `bun` и `TypeScript`:
```bash
bun init
npm init -y
bun add typescript @bun/cli @bun/node
```

**1.2. Настройка зависимостей и окружения**
- Добавить зависимости в `package.json`:
```json
{
  "name": "opencode_mosp",
  "version": "0.1.0",
  "license": "MIT",
  "scripts": {
    "start": "bun build && bun serve",
    "build": "bun build",
    "lint": "eslint . --fix"
  },
  "devDependencies": {
    "typescript": "^4.9",
    "@bun/cli": "^1.0",
    "@bun/node": "^1.0",
    "eslint": "^8.32",
    "prettier": "^2.8"
  },
  "dependencies": {
    "direnv": "^3.10",
    "axios": "^1.4",
    "react": "^18",
    "react-dom": "^18",
    "react-table": "^7.8"
  }
}
```
- Установить зависимости:
```bash
bun install
```

### 2. Настройка окружения с использованием direnv

**2.1. Создание .env файла**
- Создать файл `.env` для хранения переменных окружения:
```env
OPENCODE_API_KEY=your_api_key
```

**2.2. Настройка direnv**
- Создать файл `.direnv/env.ts` для загрузки переменных окружения:
```typescript
import { dirname } from 'path';

export default {
  OPENCODE_API_KEY: process.env.OPENCODE_API_KEY || '',
};
```

### 3. Разработка архитектуры плагина

**3.1. Создание структуры проекта**
```
src/
  plugins/
    opencode_mosp/
      index.ts
      models.ts
      api.ts
      utils.ts
      components/
        ModelTable.tsx
        SidePanel.tsx
      styles/
        main.css
  public/
    index.html
    index.css
  package.json
  README.md
  LICENSE
```

**3.2. Реализация основных компонентов**

**3.2.1. index.ts**
```typescript
import { createPlugin } from '@opencode/plugin-api';
import { fetchModels } from './api';
import { ModelTable } from './components/ModelTable';
import { SidePanel } from './components/SidePanel';

const plugin = createPlugin({
  name: 'opencode_mosp',
  owner: 'GRASTROY Creations',
  version: '0.1.0',
  license: 'MIT',
});

plugin.registerSidePanel(SidePanel);

async function init() {
  const models = await fetchModels();
  // Render table
  const table = <ModelTable models={models} />;
  document.body.appendChild(table);
}

init();
```

**3.2.2. api.ts**
```typescript
import axios from 'axios';

const API_URL = 'https://api.opencode.ai/models';
const LEADERBOARD_URL = 'https://huggingface.co/leaderboards/livecodebench';

export async function fetchModels() {
  try {
    const response = await axios.get(API_URL, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENCODE_API_KEY}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
}
```

**3.2.3. components/ModelTable.tsx**
```typescript
import React from 'react';
import { useTable } from 'react-table';

const ModelTable = ({ models }) => {
  const { useSortBy, useFilters } = useTable({
    columns: [
      {
        Header: 'Rank',
        accessor: 'rank',
      },
      {