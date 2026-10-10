import { defineMethod } from '../core'

export const STATUS_METHODS = [
  defineMethod({
    name: 'status.get',
    permission: 'workspace',
    params: null,
    // Why env rather than `app.getVersion()`: main stamps ORCA_APP_VERSION at
    // startup, and keeping electron out of the RPC layer lets the relay and
    // headless serve share this method.
    //
    // Why no `remoteUpdateSupport`: this fork removed the remote-server updater, so upstream's
    // snapshot has nothing to report and publishing the field would re-advertise an install
    // path the build cannot perform. `pairedDeviceId` is unrelated — it is how a paired client
    // attributes its own writes, and dropping it breaks navigation isolation.
    handler: async (_params, { runtime, pairedDeviceId }) => {
      // Why: a status answered while the friendly-name lookup is still in flight publishes the bare
      // hostname; the wait is capped below the CLI's status probe so a slow lookup never reads as down.
      await runtime.machineNameReady()
      return {
        ...runtime.getStatus(),
        ...(pairedDeviceId ? { pairedDeviceId } : {}),
        appVersion: process.env.ORCA_APP_VERSION ?? '0.0.0-dev'
      }
    }
  })
]
