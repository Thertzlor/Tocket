import type {SocketDefinition, Sk, Serializable, Handler, SocketRequest,DefaultSocket, LoggingTypes, SocketLike, TrapFunction, TrapReturn} from '../index.js';
import {SocketWrapper} from './SocketWrapper.js';
import {TocketBase} from './TocketBase.js';

/** This is base a WebSocket client that is connected to at least one webSocket server. This class is not meant to be used directly, instead use the derived {@link TocketClientNode} or {@link TocketClientBrowser} classes depending on your Environment.
 * @param S - The Definition Object of this socket's functionality
 */
export class TocketClientBase<S extends SocketDefinition = DefaultSocket> extends TocketBase<'Client',S> {
  /**Constructor implementation
   * @param mainURL - The URL of the WebSocket Server
   * @param customData - Data for holding this socket's state.
   * @param timeout - number of milliseconds to wait for the target socket to respond to messages
   * @param mainServerTimeout - number of milliseconds to wait for the target socket on when initializing.
   * @param mainServerInit - set to false if the server should be initialized at a later time.
   * @param mainServerLogging - Sets the logging level for the server
   * @param mainServerTrapped - Decides if the Main Server is a third party WebSocket that needs to be intercepted.*/
  constructor(mainURL:string | SocketLike, customData={} as {[K in Sk<S['data']>]:Serializable} , timeout = 1500, mainServerTimeout = 1500, mainServerInit = true, mainServerLogging?:LoggingTypes, mainServerTrapped = false) {
    super('Client', customData, timeout);
    this.defaultIdentityHandler = (async({get, content, getCustomData, send}) => {
      const init = !this.clientID;
      const origin = getCustomData('name') as string;
      console.log(`Initializing connection to ${origin}`);
      this.clientID = this.clientID || content.id;
      const socketDataOrig = this.connections.get(origin)?.customData;
      socketDataOrig && (this.connections.get(origin)!.customData = {...socketDataOrig, ...content.data});
      if (!init) send({id: this.clientID, clientData: this.customData},'identify');
      else {
        await get({id: this.clientID, clientData: this.customData},'identify');
        this.onInit();
      }
      return origin;
    });
    this.defaultCustomDataHandler = ({content, getCustomData}) => {this.connections.get(getCustomData('name') as string)!.customData[content.property] = content.value;};
    this.register('identityHandler' as any, 'identify').method = this.defaultIdentityHandler;
    this.register('customDataHandler' as any).method = this.defaultCustomDataHandler;
    this.register('setCustomData' as any, 'customDataHandler');
    (!mainServerTrapped) && this.registerSocket('main', mainURL, mainServerTimeout, mainServerInit, mainServerLogging);
  }

  /**
   * Removes a server connection from the client.
   * @param name - The name of the Server
   */
  public removeConnection(name:string):boolean{return this.connections.delete(name);}

  readonly defaultIdentityHandler:(handler:Handler<any,any>) => any;

  readonly defaultCustomDataHandler:(handler:Handler<any,any>) => any;

  /** Registers socket
   * @param name - the name of the targeted endpoint.
   * @param source - WebSocket ws or wss URL
   * @param timeout - How long to wait for the endpoint to respond
   * @param initialized - Should the connection be initialized at a later time?
   * @param logging - which messages should be logged?
   * @returns The created {@link SocketWrapper}
   * @category Primary Controls*/
  registerSocket(name:string, source:string | SocketLike, timeout = this.timeout, initialized?:boolean, logging?:LoggingTypes):SocketWrapper<S> {
    const socketWrap = new SocketWrapper<S>(name, source, this, timeout, initialized, logging);
    this.connections.set(name, socketWrap);
    return socketWrap;
  }

  /**Removes a Socket from the {@link TocketClientBase#connections} map.
   * @param name - The name of the connection to remove.
   * @returns **true** if the Socket was removed, **false** if it didn't exist.
   * @category Primary Controls*/
  removeSocket(name:string):boolean {
    console.log(`removing ${name}`);
    return this.connections.delete(name);
  }

  /**Generics message interceptor
   * @param socket - The Socket to target.
   * @returns Either the name of the {@link Communication} preset that processed the message or **true**.<br>
   * Used to decide if the message should be forwarded to the socket's default handling function if available.
   * @category Primary Controls*/
  genericMessageInterceptor(socket:SocketWrapper<S>):TrapFunction {
    return async m => {
      const parsedMessage = socket.inbound(m.data||m) as SocketRequest<any, S['presets']>;
      if (!parsedMessage) return;
      const {content, serverMessageID, clientMessageID, clientCommand, serverCommand} = parsedMessage;
      if (clientMessageID && this.promiseMap.has(clientMessageID)) return {propagate:false,handler:this.promiseMap.get(clientMessageID)?.resolver(content, socket.identifier, serverMessageID!)};
      const interceptResult:TrapReturn = await (this.presets[clientCommand]?.method({...this.generateInterface(clientCommand!, serverCommand ?? this.presets[clientCommand].handlerName as any, socket.identifier, serverMessageID!), ...{content}} as any) as Promise<TrapReturn>)?.catch?.(this.presets[clientCommand].errorCatcher);
      const propagate = (interceptResult && Object.prototype.hasOwnProperty.call(interceptResult, 'propagate'))?interceptResult.propagate:!this.presets[clientCommand!];
      return {propagate,handler:clientCommand};
    };
  }

  /**Function to be executed when connection to the main webSocket is established
   * @category Primary Controls*/
  onInit():any {/**/}
}