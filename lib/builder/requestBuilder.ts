import type { BroadcastOptions } from "socket.io-adapter"
import { RequestPayload } from "../adapter.types"
import UniqueId from "../service/UniqueId"

function addSockets(opts: BroadcastOptions, rooms: string[]): RequestPayload {
  return {
    type: 'ADD_SOCKETS',
    opts: {
      rooms: [...opts.rooms],
      except: opts.except ? [...opts.except] : [],
    },
    rooms: [...rooms],
  }
}

function delSockets(opts: BroadcastOptions, rooms: string[]): RequestPayload {
  return {
    type: 'DEL_SOCKETS',
    opts: {
      rooms: [...opts.rooms],
      except: opts.except ? [...opts.except] : [],
    },
    rooms: [...rooms],
  }
}

function disconnSockets(opts: BroadcastOptions, close: boolean): RequestPayload {
  return {
    type: 'DISCONNECT_SOCKETS',
    opts: {
      rooms: [...opts.rooms],
      except: opts.except ? [...opts.except] : [],
    },
    close,
  }
}

function remoteFetch(opts: BroadcastOptions): RequestPayload {
  return {
    type: 'REMOTE_FETCH',
    requestId: new UniqueId().toString(),
    opts: {
      rooms: [...opts.rooms],
      except: opts.except ? [...opts.except] : [],
    },
  }
}

export default {
  addSockets,
  delSockets,
  disconnSockets,
  remoteFetch,
}
