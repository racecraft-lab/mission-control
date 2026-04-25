import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const safeRegex = require('../../node_modules/.pnpm/safe-regex@2.1.1/node_modules/safe-regex') as (
  pattern: RegExp | string,
) => boolean

export default safeRegex
