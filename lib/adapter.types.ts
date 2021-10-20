import type { Room, SocketId } from 'socket.io-adapter'

export type RequestType = 
  | 'SOCKETS' 
  | 'ALL_ROOMS'
  | 'ADD_SOCKETS'
  | 'DEL_SOCKETS' 
  | 'DISCONNECT_SOCKETS'
  | 'REMOTE_JOIN'
  | 'REMOTE_LEAVE'
  | 'REMOTE_DISCONNECT'
  | 'REMOTE_FETCH'
  | 'SERVER_SIDE_EMIT'


interface AllRoomsOpts {
  rooms: Set<Room>
}
interface AllRoomsRequest {
  type: 'ALL_ROOMS'
  resolve: Function
  numSub: number
  msgCount: number
  timeout: NodeJS.Timeout
  payload: AllRoomsOpts
}

interface SocketsOpts {
  sockets: Set<SocketId>
}
interface SocketsRequest {
  type: 'SOCKETS'
  resolve: Function
  numSub: number
  msgCount: number
  timeout: NodeJS.Timeout
  payload: SocketsOpts
}

interface RemoteFetchOpts {
  sockets: {
    id: string,
    handshake: any,
    rooms: Array<Room>,
    data: any
  }[]
}

interface RemoteFetchRequest {
  type: 'REMOTE_FETCH'
  resolve: Function
  numSub: number
  msgCount: number
  timeout: NodeJS.Timeout
  payload: RemoteFetchOpts
}

interface BareRequest {
  type: 'REMOTE_JOIN' | 'REMOTE_LEAVE' | 'REMOTE_DISCONNECT'
  resolve: Function
  timeout: NodeJS.Timeout
}

export type Request =
  | AllRoomsRequest
  | SocketsRequest
  | RemoteFetchRequest
  | BareRequest

export type RequestPromiseMapping<T> =
  T extends 'SOCKETS' ? Set<Room> :
  T extends 'ALL_ROOMS' ? Set<Room> :
  T extends 'ADD_SOCKETS' ? void :
  T extends 'DEL_SOCKETS' ? void :
  T extends 'REMOTE_JOIN' ? void :
  T extends 'REMOTE_LEAVE' ? void :
  T extends 'DISCONNECT_SOCKETS' ? void :
  T extends 'REMOTE_DISCONNECT' ? void :
  T extends 'REMOTE_FETCH' ? any[] :
  void;

export type RequestOptsMapping<T extends RequestType> = 
  T extends 'SOCKETS' ? SocketsOpts :
  T extends 'ALL_ROOMS' ? AllRoomsOpts :
  T extends 'REMOTE_FETCH' ? RemoteFetchOpts :
  {} 

///

interface AllRoomsRequestPayload {
  requestId: string,
  type: 'ALL_ROOMS'
}

interface RemoteJoinAddSocketsRequestPayload {
  type: 'REMOTE_JOIN',
  requestId: string,
  socketId: SocketId,
  room: Room
}

interface InternalAddSocketsRequestPayload {
  type: 'ADD_SOCKETS',
  opts: {
    rooms: Array<Room>,
    except: Array<string>
  }
  rooms: Array<Room>
}

interface RemoteLeaveRequestPayload {
  requestId: string,
  type: 'REMOTE_LEAVE',
  socketId: SocketId,
  room: Room
}

interface InternalDelSocketsRequestPayload {
  type: 'DEL_SOCKETS',
  opts: {
    rooms: Array<Room>,
    except: Array<string>
  },
  rooms: Array<Room>
}

interface RemoteFetchRequestPayload {
  type: 'REMOTE_FETCH',
  requestId: string,
  opts: {
    rooms: Array<string>,
    except: Array<string>
  }
}

interface InternalDisconnectSocketsRequestPayload {
  type: 'DISCONNECT_SOCKETS',
  opts: {
    rooms: Array<Room>,
    except: Array<string>
  },
  close: boolean
}

interface RemoteDisconnectRequestPayload {
  requestId: string,
  type: 'REMOTE_DISCONNECT',
  socketId: SocketId,
  close?: boolean
}

interface SocketsRequestPayload {
  requestId: string,
  type: 'SOCKETS',
  rooms: Array<Room>
}

export type RequestPayload =
  | AllRoomsRequestPayload
  | InternalAddSocketsRequestPayload
  | InternalDelSocketsRequestPayload
  | InternalDisconnectSocketsRequestPayload
  | RemoteJoinAddSocketsRequestPayload
  | RemoteFetchRequestPayload
  | RemoteLeaveRequestPayload
  | RemoteDisconnectRequestPayload
  | SocketsRequestPayload

///

interface AllRoomsResponse {
  requestId: string,
  rooms: Array<Room>
}

interface SocketIdsResponse {
  requestId: string,
  sockets: Array<SocketId>
}

interface SocketsResponse {
  requestId: string,
  sockets: {
    id: string,
    handshake: any,
    rooms: Array<Room>,
    data: any
  }[]
}

interface BareResponse {
  requestId: string
}

export type ResponsePayload = 
  | AllRoomsResponse
  | SocketIdsResponse
  | SocketsResponse
  | BareResponse

export type ResponsePayloadMapping<T> = 
  T extends 'ALL_ROOMS' ? AllRoomsResponse : 
  T extends 'SOCKETS' ? SocketIdsResponse :
  T extends 'REMOTE_FETCH'? SocketsResponse :
  BareResponse;
