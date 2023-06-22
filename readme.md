# **Tocket :  A high-level, type safe WebSocket middleware and interceptor for Node and Browsers**
![GitHub package.json version (subfolder of monorepo)](https://img.shields.io/github/package-json/v/Thertzlor/Tocket) ![GitHub](https://img.shields.io/github/license/Thertzlor/Tocket) [![CodeFactor](https://www.codefactor.io/repository/github/thertzlor/tocket/badge)](https://www.codefactor.io/repository/github/thertzlor/tocket)
![logo](https://github.com/Thertzlor/Tocket/blob/main/media/tocket_big.png?raw=true) 


WebSockets are amazingly flexible but can be finnicky to set up. Tocket aims to streamline the implementation of WebSocket Server/Client pairs in a way that's easy to set up and highly customizable.

What Tocket and other middleware does under the hood is designating individual messages with unique IDs and relationships to build reliant request/response chains.  
Tocket goes another step further: Instead of dealing with individual requests, endpoints define pre-se communication routines in which information is received and sent via asynchronous functions. As the library is written in TypeScript, all outputs and input can be explicitly typed.

Tocket also offers advanced functionality geared towards debugging, userscripts, scraping, and so on by intercepting third party WebSocket connections, logging and modifying messages, while circumventing other middleware (which is why some functionality is built built with the assumption that you don't control the WebSocket you are communicating with).

Tocket expects the content of messages to be serializable into JSON and I have honestly no idea how fast and/or scalable it performs in comparison to other webSocket libraries.

# Installation

`npm install tocket`

If run in a node context with TocketClientNode, the WebSocket runs via [ws](https://github.com/websockets/ws), while the TocketClientBrowser class just uses the native WebSocket functionality.

----------
# Basic Usage
This section covers the basics of setting up a server and client with Tocket, for details you can consult the [Documentation](https://thertzlor.github.io/Tocket/modules.html)

## Server:
By default the Socket Server is initialized with a port number.  
Communication presets are created via a call to `register` and their logic is assigned in a `method` function.
```javascript
import {TocketServer} from 'tocket';

const server = new TocketServer(3333, {name: 'exampleServer'});

const vehicleData = {
  van: {wheels: 4, doors: 4, licensePlate: '123-ABC'},
  bus: {wheels: 6, doors: 2, licensePlate: '456-DEF'},
  bike: {wheels: 2, doors: 0, licensePlate: '789-GHI'}
};

server.register('vehicleHandler').method = ({content, send}) => {
  //catching invalid requests
  if(!content) return
  const {vehicleType, dataRequest} = content;
  const result = vehicleData[vehicleType][dataRequest];
  send(result);
};
```
## Client:  
Clients receive the address of the primary server they are connecting to.
Additional connections can be added later as well
```javascript
import {TocketClientNode} from 'tocket';

const client = new TocketClientNode('ws://example-server-net:3333');

client.register('vehicleDataRequest', 'vehicleHandler').method = async ({content, get}) => {
  const dataRequest = content === 'bus' ? 'licensePlate' : 'wheels';
  const response = await get({vehicleType: content, dataRequest});
  //in case the server did not respond
  if (response === undefined) throw new Error('No Data Received');
  return response;
};

const testData = await client.launch.vehicleDataRequest('bike');
```
Usually a client preset registered with an explicitly set handler preset on the server. This is however optional; If no handler name is passed, the Client will assume that the server has a preset with the same name and direct messages there.

Presets can then be triggered via the `launch` object which is the primary means of interacting with the socket.

In our example the Server/Client logic weaves together like this:
```javascript
  const dataRequest = content === 'bus' ? 'licensePlate' : 'wheels';
  const response = await /* 
  if(!content) return
  const {vehicleType, dataRequest} = content;
  const result = vehicleData[vehicleType][dataRequest];
  send(result);
  */ get({vehicleType: content, dataRequest});
  //in case the server did not respond
  if (response === undefined) throw new Error('No Data Received');
  return response;

```
It is of course possible to use an arbitrary number of `get` calls to bounce information back and forth as needed.

----------
# Adding Types
Typing your WebSocket interfaces is one of the core features of Tocket.  
Types are defined centrally in a so called "Socket Definition" which is passed as a type parameter to the constructor.  
If a Socket is initialized with a definition, only methods with names present in the `presets` of that definition can be registered on the socket and their method handlers, `content`, `get`, `send`, etc is typed accordingly.  

```typescript
import {TocketServer} from 'tocket';

interface ServerDefinition {
  presets:{
    vehicleHandler:{
      content:{
        vehicleType:'bus'|'van'|'bike',
        dataRequest:'wheels'|'licensePlate'|'doors'
      },
      sends:string|number
    }
  }
}

const server = new TocketServer<ServerDefinition>(3333, {name: 'exampleServer'});

const vehicleData = {
  van: {wheels: 4, doors: 4, licensePlate: '123-ABC'},
  bus: {wheels: 6, doors: 2, licensePlate: '456-DEF'},
  bike: {wheels: 2, doors: 0, licensePlate: '789-GHI'}
} as const;


server.register('vehicleHandler').method = ({content, send}) => {
  //Just to be safe all types are nullable
  if (!content) return;
  const {vehicleType, dataRequest} = content;
  const result = vehicleData[vehicleType][dataRequest];
  //Compiler would complain if we sent the wrong type.
  send(result);
};
```
And in the following example the Client is fully typed, which includes not only the types for all parameters in the `method` handler but also which keys exist in the `launch` and what arguments are used to execute a preset.
```typescript
import {TocketClientNode} from 'tocket';

interface ClientDefinition {
  presets:{
    vehicleDataRequest:{
      content:'bus'|'van'|'bike',
      sends: {vehicleType:'bus'|'van'|'bike', dataRequest:'wheels'|'licensePlate'|'doors'},
      gets:string|number,
      returns:Promise<string|number>
    }
  }
}

const client = new TocketClientNode<ClientDefinition>('ws://example-server-net:3333');

client.register('vehicleDataRequest', 'vehicleHandler').method = async ({content, get}) => {
  const dataRequest = content === 'bus' ? 'licensePlate' : 'wheels';
  const response = await get({vehicleType: content, dataRequest});
  //in case the server did not respond
  if (response === undefined) throw new Error('No Data Received');
  return response;
};

//Full intellisense for the vehicleDataRequest function-call
const testData = await client.launch.vehicleDataRequest('bike');
```
Note how the types for the content of the `sends` type on the Server Side is mirrored on the `gets` type of the client, while the client's `sends` type is received as the server's `content`.

----------
# Anatomy of the Communication Handler
Designing Communication Presets is the main aspect of working with Tocket, this is done with and a Communication Handler which is passed as an argument into the method of the Communication Preset. We'll go over the basic content of the Communication Handler in this section.

----------

>content

The Communication Handler's content property holds the data with which the Communication Preset was initially called, either through the `launch` object or the first `send` or `get` call in a request chain.

----------

>send(msg?: any, handlerFunction?: string, targetSelector?: ConnectionFilter, transferOptions?: OptionsList, adapterOptions?: Record<string, any>)

This method is used to send Data to other sockets. The Communication Preset is initialized with defaults for all parameters except `msg`, which is the actual content we want send. As usual this should be data that can be parsed as JSON.

We can use the `handlerFunction` parameter send our data to a different handler preset on the other socket than the one specified during the Preset's `register` call.

`targetSelector` overrides the default target socket. In the case of the Client all Server connections are named (with the server at the address in the constructor receiving the name "main"), and their names are used to target requests.  
On Servers however Clients do not have individual names, instead being referenced by automatically generated GUIDs. In order to target the right clients a server can pass an object as an `ConnectionFilter` which will filter clients based on the contents of their customData properties.  
Let's say we have instantiated a client with the customData object `{type:'nodeClient'}`. We can use this same object in the `targetSelector` parameter of a server `send` or `get` method to target only clients with the same property. We can specify as many filters as we want: If we pass `{type:'nodeClient', age:30}` only clients in which both properties have the correct value will receive the message.

We can further control the socket behavior with the `transferOptions` parameter which can set a number of modifiers, the most important one for `send` being `sendMode`. If set to *'first'* only the first client matching the targetSelector will receive the message, if set to *'all'* (the default), all matching clients receive it.

----------
>get(msg?: any, handlerFunction?: string, timeout?: number, targetSelector?: ConnectionFilter, transferOptions?: OptionsList, adapterOptions?: Record<string, any>)

The `get` method works the same as send, except it waits for responses and returns them. For that reason it can receive a `timeout` parameter which can be used to customize timeouts on an individual basis, in case some steps of a communication preset are more or less responsive than others.

The filtering of receiving connections works exactly as with `send`, but in our `adapterOptions` we can also set a `getMode`, which is especially useful in the case of servers sending to multiple clients; We can set the property to *'all'* in which case the communication Handler will wait until all targeted clients have responded and then send all responses as an array. The other option is *'race'* which will immediately return the first received response and discard all others.

----------
>getCustomData(key?: string, targetSelector?: ConnectionFilter, transferOptions?: OptionsList)

Access the customData of the client/server you are currently connected to, or use the `targetSelector` to select any other connected socket.  
If called without the `key` parameter the entire customData object will be returned.  
getCustomData is not asynchronous, because it does not directly query the client, instead whenever a client's or server's customData object is updated the change is immediately propagated through a separate connection to all connected sockets, which save the current state locally and this local copy is what the getCustomData method will query.

----------
>setCustomData(key: string, value: Serializable)

This method is used to modify the customData *of the current socket.*  
The customData can hold any kind of data that serializable into JSON and a client or server can only update *its own* customData object. As stated above all changes are propagated immediately. For this reason, putting *huge* chunks of data into your customData object is probably not the best idea.

----------
# TODOs
* refine annotations
* include examples for SocketInterceptor
