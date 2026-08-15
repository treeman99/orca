import { defineMethod, type RpcMethod } from '../core'

export const STATUS_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'status.get',
    params: null,
    // Why env rather than `app.getVersion()`: main stamps ORCA_APP_VERSION at
    // startup, and keeping electron out of the RPC layer lets the relay and
    // headless serve share this method.
    //
    // Why no `remoteUpdateSupport`: this fork removed the remote-server updater, so upstream's
    // snapshot has nothing to report and publishing the field would re-advertise an install
    // path the build cannot perform. `pairedDeviceId` is unrelated — it is how a paired client
    // attributes its own writes, and dropping it breaks navigation isolation.
    handler: (_params, { runtime, pairedDeviceId }) => ({
      ...runtime.getStatus(),
      ...(pairedDeviceId ? { pairedDeviceId } : {}),
      appVersion: process.env.ORCA_APP_VERSION ?? '0.0.0-dev'
    })
  })
]
