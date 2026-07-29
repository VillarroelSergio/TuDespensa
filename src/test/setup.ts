import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import '@testing-library/jest-dom/vitest'

// Sin `globals: true` en vitest.config.ts, Testing Library no engancha su
// limpieza automática: el DOM de un test sobrevivía al siguiente y los
// `getByRole` del segundo encontraban elementos duplicados del primero
// (auditoría 2026-07-29).
afterEach(cleanup)
