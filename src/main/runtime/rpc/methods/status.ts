import { defineMethod, type RpcMethod } from '../core'

export const STATUS_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'status.get',
    params: null,
    // Why env rather than `app.getVersion()`: main stamps ORCA_APP_VERSION at
    // startup, and keeping electron out of the RPC layer lets the relay and
    // headless serve share this method.
    handler: (_params, { runtime }) => ({
      ...runtime.getStatus(),
      appVersion: process.env.ORCA_APP_VERSION ?? '0.0.0-dev'
    })
  })
]
