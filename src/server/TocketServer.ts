import type {SocketDefinition, Sk, Serializable, SocketRequest,DefaultSocket} from '../index.js';
import {ClientWrapper} from '../base/ClientWrapper.js';
import {TocketBase} from '../base/TocketBase.js';
import {v4 as uuid} from 'uuid';
import {type Data,WebSocketServer} from 'ws';
import type * as https from 'https';

/** A class to end all classes
 * @param S - The Provided Socket Definition
 */
export class TocketServer<S extends SocketDefinition = DefaultSocket> extends TocketBase<'Server',S>{
  /** Creates an instance of the Tocket SocketServer.
   * @param port - the Port the WebSocket will be listening on.
   * @param data - an Object of custom data that will be made accessible to all endpoints
   * @param timeout -  number of milliseconds to wait for an endpoint to answer a message
   * @param server - If you are using an https server you can inject it here.
   * @param keepDateTimeStrings - by default ISO datetime strings will automatically be parsed into Date objects, set to false to disable this behavior.
   */
  constructor(port:number, data= {} as {[K in Sk<S['data']>]:Serializable}, server?:https.Server, timeout = 1500, private readonly keepDateTimeStrings=true) {
    super('Server', data, timeout);
    console.log(`now listening on port ${port}`);
    const heartbeat = (forID:string) => () => (this.connections.get(forID) || {} as any).alive = true;
    const remove = (id:string) => (console.log(`removing client ${id}`),this.connections.delete(id));

    this.defaultIdentityHandler = async({get, content, send}) => {
      const newID = content.id;
      //fetching identity confirmation and client data
      const {id: confirmedID, clientData} = await get(content);
      console.log(`Connection confirmed from Client ${confirmedID}\nClient Properties: ${JSON.stringify(clientData)}`);
      //If the Client already received an ID  we'll be using that instead.
      if (newID !== confirmedID) {
        this.connections.set(confirmedID, this.connections.get(newID)!);
        this.connections.delete(newID);
        return;
      }
      this.connections.get(confirmedID)!.customData = clientData;
      //Sending back the confirmation of registration, now the Client can starts its OnInit function.
      send('Connection confirmed.');
      return confirmedID as string;
    };

    this.defaultCustomDataHandler =({content:{id,property,value}}) => {
      const clientData = this.connections.get(id)?.customData ?? {};
      clientData[property] = value;
      console.log(`Client ${clientData.name||id} setting property "${property}" to "${typeof value === 'object'?JSON.stringify(value):value}"`);
    };

    this.register('identify' as any, 'identityHandler').method = this.defaultIdentityHandler;
    this.register('customDataHandler' as any).method = this.defaultCustomDataHandler;
    this.register('setCustomData' as any, 'customDataHandler');

    const SocketServer = server?
      new WebSocketServer({'server': server}, () => null) :
      new WebSocketServer({'port': port}, () => null);
    SocketServer.on('connection', ws => {
      return void ((async() => {
        const clientID = this.makeUUID();
        this.connections.set(clientID, new ClientWrapper(clientID, ws));
        //Binding standard socket functions
        ws.on('message', message => this.onmessage(message)).on('error', error => console.log(error)).on('pong', heartbeat(clientID));
        //TODO Automatic reconnecting still doesn't work...
        ws.onclose= () => (console.log('a connection has closed.'),remove(clientID));
        const connectionID = await (this._launch('identify' as any, {id: clientID, data: this.customData} as any, clientID) as any);
        if (connectionID) {
          if (connectionID !== clientID){
            remove(connectionID);
            this.connections.set(clientID, new ClientWrapper(clientID, ws));
            ws.onclose= () => (console.log('a connection has closed.'),remove(clientID));
            ws.on('pong', heartbeat(clientID));
          }
        }
        else ws.close();
      })());
    });
    const interval = setInterval(() => this.connections.forEach((ws,key) => {
      if (!ws.alive) return (console.log('a connection is no longer alive.'),remove(key)) && ws.socket.terminate?.();
      ws.alive = false;
      ws.socket.ping?.(() => void 0);
    }), 10000);

    SocketServer.on('close', () => clearInterval(interval));
    if (server)server.listen(port);
  }

  /** Stringify Received Data
   * @param data - The Received Data
   * @category Internal Methods
  */
  convertData(data:Data):SocketRequest{return JSON.parse((data as any).toString(),(_,v) => ((this.keepDateTimeStrings && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))?new Date(v):v));}

  /** Placeholder for the default identity method
   * @param handler - The handler function
   * @category Internal Methods
  */
  readonly defaultIdentityHandler:(handler:any) => any;
  /** Placeholder for the default custom Data method
   * @param handler - The handler function
  * @category Internal Methods
 */
  readonly defaultCustomDataHandler:(handler:any) => any;

  /** Basic message handling.
   * @param message - the message received by the Socket.
   * @category Internal Methods*/
  private onmessage(message:Data) {
    const parsedMessage:SocketRequest = typeof message ==='string'? JSON.parse(message,(_,v) => ((this.keepDateTimeStrings && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))?new Date(v):v)):this.convertData(message);
    const {content, serverMessageID, clientMessageID, serverCommand, clientCommand, clientId} = parsedMessage;
    //Filtering out clients that are not properly registered
    if (clientId && !this.connections.has(clientId) && serverCommand !== 'identify') return console.log(`Rejected connection from Client with unknown ID ${clientId}`);
    //If the received message refers to a previous request, the promise is resolved here.
    if (serverMessageID && this.promiseMap.has(serverMessageID)) this.promiseMap.get(serverMessageID)?.resolver(content, clientId!, clientMessageID!);
    //otherwise we delegate the message to the specified handler function
    else this.presets[serverCommand??'']?.method({...this.generateInterface(serverCommand as any, clientCommand as any, clientId!, clientMessageID), ...{content}} as any)?.catch?.((e:any) => this.presets[serverCommand??''].errorCatcher(e));
  }

  /**Generates a UUID using the node-uuid package.
   * @returns secure UUID
   * @category Internal Methods*/
  protected override makeUUID():string {return uuid();}
}