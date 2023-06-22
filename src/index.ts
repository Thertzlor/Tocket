/**
 * @packageDocumentation
 * This is the primary entrypoint of the Tocket package.
 */

import {TocketServer} from './server/TocketServer.js';
import {TocketClientNode} from './server/TocketClientNode.js';
import {TocketClientBrowser} from './browser/TocketClientBrowser.js';
import type {SocketMethods} from './base/TocketBase.js';

export {TocketServer,TocketClientBrowser,TocketClientNode,SocketMethods};

/**
   * Decides if and which messages a {@link SocketWrapper} or {@link ClientWrapper} will log.<br>
   * - **none**: Don't log any messages.
   * - **all**: Log all messages.
   * - **sent**: Only log outgouing messages.
   * - **received**: Only log incoming messages.
   * @category Primary Interfaces*/
export type LoggingTypes = 'none' | 'all' | 'sent' | 'received';
/**@internal */
export interface SocketLike { send(...args:any):any, onmessage:any, onerror:any, onopen:any, onclose:any, url:string, terminate?():any, ping?(func:any):any, readyState:number, CLOSED:number, OPEN:number, CLOSING:number, CONNECTING:number}
/** The TrapReturn type handles
   * @category Primary Interfaces*/
export type TrapReturn = {
      /**If true, the response of the trapFunction will be forwarded to the socket, if not no response is returned*/
      propagate?:boolean,
      /** Data with which to override the originally intercepted request.
       * If an array is passed, entries will be applied as separate arguments.
       */
      override?:any,
      /**The name of the handler function that will process the intercepted data.*/
      handler?:string
    };
/**
   * @param args - Any arguments passed to the trapped function
   * @category Primary Interfaces*/
export type TrapFunction = (...args:any) => Promise<TrapReturn|undefined>;


/**
 * Union of all types that can be safely encoded in JSON format.
 * @category Internal Protocols
*/
type JsonSafe = string|number|boolean|null|undefined|Date;
/**@category Internal Protocols*/
type SendMap<T extends PresetConfig, V extends ConnectionFilter> = 'sendsTo' extends Sk<T>? V extends Sk<T['sendsTo']>?T['sendsTo'][V]:AnyBack<T,'sends'> : AnyBack<T,'sends'>;

/**@category Internal Protocols*/
type GetMap<T extends PresetConfig, V extends ConnectionFilter> = 'getsFrom' extends Sk<T>? V extends Sk<T['getsFrom']>?T['getsFrom'][V]:AnyBack<T,'gets'> : AnyBack<T,'gets'>;

/**@category Internal Protocols*/
type SocketPresets = Record<string,PresetConfig>;
/**@category Internal Protocols*/
export type FilterType<T extends string[]> = T[number] | Record<string, any>;

/**
 * Object with infinitely nested types
 * @category Internal Protocols*/
interface Nested<T> {[s:string]:T|Nested<T>}

/** This type is used to define the types involved in a communication preset.
 * @category Primary Interfaces*/
export type PresetConfig = {
  /**Type of the `content` argument received by the handler.*/
  content?:any,
  /**Return type of the communication method.*/
  returns?:any,
  /**The type received from the {@link Handler.send}*/
  gets?:Serializable,
  /**The type Sent to the connecting socket via the {@link Handler.send} method*/
  sends?:Serializable,
  /**If different socket connections send different types through the `get` method, we can map specific socket names to different types. Overrides the {@link PresetConfig.gets} property*/
  getsFrom?:Record<string,Serializable>,
  /**If the types sent differ based on which socket is targeted, this option can map different types to specific connection names.
   * Overrides the {@link sends} property. */
  sendsTo?:Record<string,Serializable>};
/**Any valid combination of JSON compatible types
 * @category Internal Protocols*/
export type Serializable = JsonSafe|(JsonSafe|Serializable)[]|Nested<Serializable>;
/**Extract only string keys from an OBject.
 * @category Internal Protocols*/
export type Sk<T> = Extract<keyof T, string>;

/**@category Primary Interfaces*/
export type SocketDefinition={
    /**Type Definitions for the different communication presets on the Socket.*/
    presets:SocketPresets
    /**Type defintion for the custom data object.*/
    data?:Record<string,Serializable>
    /**List of named connections. Only relevant for clients.*/
    connections?:string[]
  };

/**@category Primary Interfaces*/
export type OptionsList = Record<string, any> & { getMode?:'first' | 'collect', dataMode?:'first' | 'collect', sendMode?:'first' | 'all' };

/**@category Internal Protocols*/
export type ConnectionFilter<T extends string[] = string[]> = FilterType<T>|FilterType<T>[];
/**@category Internal Protocols*/
export type AnyBack<T extends PresetConfig,U extends Sk<PresetConfig>> = U extends Sk<T>? T[U]:any;

/**@category Primary Interfaces*/
export type StandardPresets = {
    /**Default method to set custom data.*/
    setCustomData:{content:Serializable,returns:void}
    /**Default method to identify a client to a server.*/
    identify:{content:{id:string},returns:string|Promise<string>,gets:number,sends:string},
    /**Default method to retrieve custom data. */
    customDataHandler:{content:{id:string,property:string,value:Serializable},returns:void}
  };

/**@category Primary Interfaces*/
export interface DefaultSocket {presets:SocketPresets&StandardPresets,data:Record<string,Serializable>}

/** whatever you want
   * @param P - The preset configuration of the current method.
   * @param C - The designation of one or more connection this method communicates with.
   * @category Primary Interfaces*/
export type Handler<P extends PresetConfig = any, C extends string[] = string[]> = {
    /**
     * Function for sending data to another socket and returning one or more results.
     * @param msg - The data to send
     * @param handlerFunction - The name of the handler function on the target. If left empty the name of the current preset will be used.
     * @param timeout - Number of milliseconds until the request is classified as failed.
     * @param targetSelector - name or filter object based on which the receiving socket(s) will be targeted.
     * @param transferOptions -
     * @param adapterOptions - An object containing additional data to be forwarded to the outbound adapter if one is present.
     */
    get<O extends OptionsList, F extends ConnectionFilter<C>>(msg?:SendMap<P,F>, handlerFunction?:string, timeout?:number, targetSelector?:F, transferOptions?:O, adapterOptions?:Record<string, any>):(O['getMode'] extends 'collect'?Promise<{id:string,reply:GetMap<P,F>}[]>:Promise<GetMap<P,F>>)|undefined,
    /** Function for sending data to another socket without expecting a return value.
     * @param F - Default connection filter.
     * @param msg - The data to send to the other socket(s).
     * @param handlerFunction - The name of the handler that will receive the data on the recipient.
     * @param targetSelector - name or filter object based on which the receiving socket(s) will be targeted.
     * @param transferOptions - name or filter object based on which the receiving socket(s) will be targeted.
     * @param adapterOptions - An object containing additional data to be forwarded to the outbound adapter if one is present.
    */
    send<F extends ConnectionFilter<C>>(msg?:SendMap<P,F>, handlerFunction?:string, targetSelector?:F, transferOptions?:OptionsList, adapterOptions?:Record<string, any>):void,
    /** Function for retrieving customData properties from one or more connected endpoints. This function is not async and fetches the currently cached customData.
     * @param key - The name of the property you want to fetch If left empty the entire customData object will be fetched.
     * @param targetSelector - The Endpoint to query. If left empty the endpoint(s) targeted by the current Communication will be used.
     * @param transferOptions - An Options object, by default the one the Communication was inititialized with. The "dataMode" property of the options object is used to decide of the customData value of first connected endpoint is returned ("first"), or if an array of values is returned
     * @returns Either the value of a single customData property or the entire customData object*/
    getCustomData(key?:string, targetSelector?:ConnectionFilter<C>, transferOptions?:OptionsList):Serializable,
    /** hidden overload
     * @internal
    */
    getCustomData(key?:null, targetSelector?:ConnectionFilter<C>, transferOptions?:OptionsList):Record<string,Serializable>,
    /** hidden overload
     * @internal */
    getCustomData(key?:'id', targetSelector?:ConnectionFilter<C>, transferOptions?:OptionsList):string,
    /**Function for modifying the the current endpoint's customData properties. The change is immediately propagated to all active connections
     * @param key - The name of the property you want to change in your customData. If it already exists, it will be overwritten.
     * @param value - The new value of the property*/
    setCustomData(key:string, value:Serializable):void,
    /**The content of the message which initialized this request chain.*/
    content?:AnyBack<P,'content'>
  };

/** Standard format containing information about a received or sent WebSocket request.
 * @param T - The content type.
 * @param R - The command name.
 * @category Internal Protocols*/
export type SocketRequest<T = any, R extends SocketPresets = StandardPresets> =
    {
      /**The name of the handler function of the {@link TocketClientBase} that should process this request when receiving it.*/
      clientCommand?:Sk<R>,
      /**The name of the handler function of the {@link TocketServer} that should process this message when receiving it.*/
      serverCommand?:string,
      /**content of the message.*/
      content?:T,
      /**timestamp of when the message was sent*/
      timestamp:number,
      /**when receiving, unique ID generated when the {@link TocketServer} sent this message, usually echoed back to the server when replying.*/
      serverMessageID?:string,
      /**whens sending, unique ID generated when the {@link TocketClientBase} sent this message, usually echoed back by the Client when responding.*/
      clientMessageID?:string,
      /**unique ID generated when the {@link TocketServer} sent this message*/
      clientId?:string
      /**name of the WebSocket connection this sent this request*/
      originSocket?:string
    };
