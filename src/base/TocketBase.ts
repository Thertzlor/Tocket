import {Communication} from './Communication.js';
import type {SocketWrapper} from './SocketWrapper.js';
import type {ClientWrapper} from './ClientWrapper.js';
import type {SocketDefinition, Sk, SocketRequest, ConnectionFilter, Serializable, Handler, OptionsList, FilterType} from '../index.js';

/** @category Internal Protocols*/
type DefBack<T extends SocketDefinition,U extends Sk <T['presets']>, V extends string> = V extends Sk<T['presets'][U]>? T['presets'][U][V]:any;
/** @category Internal Protocols*/
type ConnectionType<T extends 'Server' | 'Client',S extends SocketDefinition> = T extends 'Client' ? SocketWrapper<S> : T extends 'Server' ? ClientWrapper: never;
/**@category Internal Protocols*/
type PromiseData = {message:SocketRequest,resolver:(m:SocketRequest, n:string, s:string) => string;};
/**@category Primary Interfaces*/

/**@category Internal Protocols*/
type Connector<T extends SocketDefinition> = 'connections' extends Sk<T>? T['connections']:string[];

/**@category Primary Interfaces*/
export type SocketMethods<S extends SocketDefinition> = {[K in Sk<S['presets']>]:(content?:DefBack<S,K,'content'>, targetFilter?:ConnectionFilter<NonNullable<Connector<S>>>) => DefBack<S,K,'returns'> };

/** The base class that implements the core logic of Tocket. Since WebSockets are bidirectional most functionality is shared between clients and servers.
 * This Class is not meant to be used directly, use any of the Client and Server classes that inherit from it.
 * @param T - Decides if this instance of the TocketBase Class belongs to a {@link TocketClientBase} or {@link TocketServer} instance.
 * @param S - Definition object for the functionality of the Socket.
 */
export class TocketBase<T extends 'Client' | 'Server',S extends SocketDefinition>{
  /**Constructor implementation
   * @param type - The Socket type.
   * @param customData - Object in which the socket can store its data.
   * @category Internal Methods
  */
  constructor(
    /**Type  of the Socket, can either be "Server" or "Client"
     * @category General Properties*/
    private readonly type:T,
    /**
     * @category General Properties */
    protected customData = {} as {[K in Sk<S['data']>]:Serializable},
    /**
     * @category General Properties */
    public timeout=1500
  ) {}

  /**Client id generated by the server, empty in the Base and Server versions of the class
   * @category General Properties*/
  clientID:string|undefined = undefined;
  /**Map holding all communication presets registered to the Socket
   * @category Internal Data*/
  protected presets = {} as {[K in Sk<S['presets']>]:Communication<S['presets'][K],NonNullable<Connector<S>>> };
  /** @category Internal Data*/
  protected promiseMap= new Map<string, PromiseData>();
  /** @category Internal Data*/
  protected connections= new Map<string, ConnectionType<T,S>>();
  /** @category Primary Controls*/
  public launch = {} as SocketMethods<S>;

  /** Dummy ID generator, since the actual ID generation depends on the final environment.
   * @returns empty string.
   * @category Internal Methods*/
  protected makeUUID():string {return '';}

  public getPromiseId(requestFilter:Partial<SocketRequest>):string|undefined{
    for (const [i,{message}] of this.promiseMap.entries()) {
      let conflict = false;
      let k:keyof SocketRequest;
      for (k in requestFilter) {
        if (!requestFilter.hasOwnProperty(k)) continue;
        if (requestFilter[k] !== message[k]){
          conflict = true;
          break;
        }
      }
      if (conflict) continue;
      return i;
    }
    return void 0;
  }

  /**List all registered communication presets
   * @returns Array of preset names
   * @category Primary Controls*/
  listPresets():string[] {return Object.keys(this.presets);}

  /** Compiles a SocketRequest object from provided data.
   * @param msg - the message body this should be transferred to the endpoint
   * @param command - the name of the endpoint's handler function this should process the message
   * @param oldID - ID of the message this is being replied to.
   * @returns SocketRequest Object
   * @category Internal Methods*/
  private compileSocketRequest(msg:any, command:Sk<S['presets']>, oldID?:string):SocketRequest<any, S['presets']> {
    const newID = this.makeUUID();
    return {
      clientMessageID: this.type === 'Server' ? oldID : newID,
      serverMessageID: this.type === 'Client' ? oldID : newID,
      clientCommand: this.type === 'Server' ? command : '' as any,
      serverCommand: this.type === 'Client' ? command : '',
      clientId: this.clientID,
      timestamp: Date.now(),
      content: msg
    };
  }

  /** Objects filter
   * @param comparisonObject - A filter object
   * @param targetObject - The "real" object to test against
   * @returns true if the targetObject contains identical properties to the filter object, otherwise false
   * @category Internal Methods*/
  private objectFilter(comparisonObject:Record<string, any>, targetObject:Record<string, any>):targetObject is typeof comparisonObject {
    return (!targetObject) ? false :
      Object.keys(comparisonObject).every(key => {
        const obj = comparisonObject[key];
        if (typeof obj !== typeof targetObject[key]) return false;
        return (obj && typeof obj === 'object') ? this.objectFilter(obj, targetObject[key]) : obj === targetObject[key];
      });
  }

  /** Providing the communication method with smart and typed parameter functions.
   * @param presetName - Name of preset
   * @param handler - handler name
   * @param initialTarget - targetName
   * @param pID - PID instance
   * @returns The finished method handler
   * @category Internal Methods*/
  generateInterface<N extends Sk<S['presets']>>(presetName:N, handler:Sk<S['presets']>, initialTarget:ConnectionFilter<NonNullable<Connector<S>>>, pID?:string):Handler<S['presets'][N],NonNullable<Connector<S>>> {
    const preset = this.presets[presetName];
    const idStore:Map<string, string> = new Map();
    const initialConnections = this.getConnections(initialTarget !== null ? initialTarget : preset.target);
    pID && initialConnections.forEach(c => idStore.set(c.identifier, pID));

    return {
      get: <O extends OptionsList>(msg:any, handlerFunction = handler, timeout = preset.timeout, targetSelector?:ConnectionFilter<NonNullable<Connector<S>>>, transferOptions?:O, adapterOptions:Record<string, any> = preset.adapterOptions):(O['getMode'] extends 'collect'?Promise<{id:string,reply:any}[]>:Promise<any>)|undefined => {
        const opts = transferOptions || preset.transferOptions;
        const contentPromise = (connection:ConnectionType<T,S>,collecting?:boolean):Promise<any> => new Promise((resolve, reject:(reason:string) => void) => {
          const message = this.compileSocketRequest(preset.outbound(msg, adapterOptions), handlerFunction, idStore.get(connection.identifier));
          const promiseID = message[this.type === 'Client' ? 'clientMessageID' : 'serverMessageID'];
          if (!promiseID) return;
          let {content,...promiseMessage} = message;
          if (content)content = null;
          this.promiseMap.set(promiseID, {message:promiseMessage as any,resolver:(m, identifier:string, s:string) => {
            idStore.set(identifier, s);
            this.promiseMap.delete(promiseID);
            const reply = preset.inbound(m, adapterOptions);
            resolve(collecting?{id:connection.identifier,reply}:reply);
            return presetName as string;
          }});
          connection.send(message);
          if (timeout) setTimeout(() => (this.promiseMap.delete(promiseID),reject(`Get request in communication preset ${presetName} could not be completed.\n${this.type === 'Server' ? 'Client' : 'Server'} connection timed out after ${timeout}ms.`)), timeout);
        });

        const connections = targetSelector ? this.getConnections(targetSelector) : initialConnections;
        if (!connections.length) return;
        return (Promise[((opts?.getMode === 'collect') ? 'all' : 'race')] as any)(connections.filter((_, i) => (opts?.sendMode !== 'first' || i === 0)).map(c => contentPromise(c,(opts?.getMode === 'collect'))));
      },

      send:(msg:any, handlerFunction:Sk<S['presets']> = handler, targetSelector?:ConnectionFilter<NonNullable<Connector<S>>>, transferOptions:OptionsList = preset.transferOptions, adapterOptions:Record<string, any> = preset.adapterOptions) => {
        const sendConnections = targetSelector ? this.getConnections(targetSelector) : initialConnections;
        sendConnections.filter((_, i) => ((transferOptions?.sendMode !== 'first' || i === 0))).forEach(c => c.send(this.compileSocketRequest(preset.outbound(msg, adapterOptions), handlerFunction, idStore.get(c.identifier) ?? '')));
      },
      getCustomData:(key?:string|null, targetSelector?:ConnectionFilter<NonNullable<Connector<S>>>, transferOptions:OptionsList = preset.transferOptions):any => {
        const dataConnections = targetSelector ? this.getConnections(targetSelector) : initialConnections;
        const fetchData = (connection:ConnectionType<T,S>) => {
          const targetData = connection?.customData;
          return targetData? (key ? (key === 'id'?connection.identifier: targetData[key]): targetData) : null;
        };
        return (transferOptions?.dataMode === 'collect') ? dataConnections.map(fetchData) as Serializable[] : fetchData(dataConnections[0]) as Serializable;
      },
      setCustomData:(key:Sk<S['data']>, value:Serializable) => this.setCustomData(key, value)
    };
  }

  /** Fetch all or a subset of current connections of the Socket, optionally narrowed by a filter.
   *@param arg - a Filter for the connections to be fetched. If left empty, all connections are returned.
   *@category Primary Controls
  */
  public getConnections(arg?:ConnectionFilter<NonNullable<Connector<S>>>):ConnectionType<T,S>[] {
    if (!arg) return Array.from(this.connections).map(v => v[1]);
    const extract = (entry:FilterType<NonNullable<S['connections']>>) => {
      if (typeof entry === 'string') {
        const singleConnection = this.connections.get(entry);
        return singleConnection ? [singleConnection] : [];
      }
      return Array.from(this.connections).map(c => c[1]).filter(c => this.objectFilter(entry, c.customData));
    };
    const res = Array.isArray(arg)?arg.map(extract).reduce((pr,cu) => pr.concat(cu),[]):extract(arg);
    return res;
  }

  /** Modifies custom data on a Socket or Client. All connected Sockets and Clients receive the change immediately.
   * @param property - name of the property to set
   * @param value - new value of the property
   * @param targetFilter - endpoints on which to set the property.
   * <br>If the filter matches multiple connections the property will be set on **all** of them.
   *@category Internal Methods*/
  setCustomData(property:Sk<S['data']>, value:Serializable):void {
    this.customData[property] = value;
    this._launch('setCustomData' as any, {property, value, id:this.clientID} as any);
  }

  /** Access the CustomData object of this Socket.
   * @param key - The key of the CustomData property to fetch. If left out the entire CustomData Object is returned.
   * @returns Either the content of the CustomData property or the CustomData Object
   */
  getCustomData<K extends Sk<(S['data'] & {id:string})>>(key?:K):K extends Sk<(S['data'] & {id:string})>? (S['data'] & {id:string})[K]:S['data']{
    return key ? (key === 'id' ?this.clientID: this.customData[key as never]): this.customData as any;
  }

  /** Registers a communication preset.
   * @param name - identifier of this preset.
   * @param handlerName - name of the handler function on the target Socket this should process the messages
   * @param defaultTarget - identifier of the Socket the communication should target. uses the 'main' socket by default
   * @returns the generated Communication preset.
   * @category Primary Controls*/
  public register<N extends Sk<S['presets']>>(name:N, handlerName?:string, defaultTarget?:ConnectionFilter<NonNullable<Connector<S>>>, timeout:number = this.timeout):Communication<S['presets'][N], NonNullable<Connector<S>>> {
    const target = defaultTarget || (this.type === 'Client' ? 'main' : '');
    const preset = new Communication<S['presets'][N],NonNullable<Connector<S>>>(name, handlerName||name, timeout);
    preset.target = target;
    this.presets[name] = preset;
    this.launch[name] = (content?:DefBack<S,N,'content'>, targetFilter?:ConnectionFilter<NonNullable<Connector<S>>>) => this._launch(name,content,targetFilter);
    return preset;
  }

  /** Launch a previously registered communication preset.
   * @param name - the name of the communication preset to start
   * @param content - the data used to initialize the connection.
   * @param targetFilter - the identifier of the endpoint this should receive this message
   * @category Internal Methods*/
  protected _launch<N extends Sk<S['presets']>>(name:N, content?:DefBack<S,N,'content'>, targetFilter?:ConnectionFilter<NonNullable<Connector<S>>>):DefBack<S,N,'returns'> {
    return this.presets[name]?.method({...this.generateInterface(name, this.presets[name].handlerName as any, targetFilter || this.presets[name].target!), ...{content}})?.catch?.((e:any) => ((this.presets[name]?.errorCatcher(e)) ? this.presets[name]?.errorCatcher(e) : console.log(`Communication Preset "${name}" is missing or malfunctioning. error: ${e}`)));
  }
}
