#!/usr/bin/env node
// stdio only: the server opens no network port. Research use only.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

await createServer().connect(new StdioServerTransport())
