var Pd4WebModule = (() => {
  var _scriptName =
    typeof document != "undefined" ? document.currentScript?.src : undefined;
  if (typeof __filename != "undefined") _scriptName = _scriptName || __filename;
  return function (moduleArg = {}) {
    var moduleRtn;
    var Module = moduleArg;
    var readyPromiseResolve, readyPromiseReject;
    var readyPromise = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve;
      readyPromiseReject = reject;
    });
    var ENVIRONMENT_IS_AUDIO_WORKLET =
      typeof AudioWorkletGlobalScope !== "undefined";
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof importScripts == "function";
    var ENVIRONMENT_IS_NODE =
      typeof process == "object" &&
      typeof process.versions == "object" &&
      typeof process.versions.node == "string" &&
      process.type != "renderer";
    var ENVIRONMENT_IS_PTHREAD =
      ENVIRONMENT_IS_WORKER && self.name == "em-pthread";
    if (ENVIRONMENT_IS_NODE) {
      var worker_threads = require("worker_threads");
      global.Worker = worker_threads.Worker;
      ENVIRONMENT_IS_WORKER = !worker_threads.isMainThread;
      ENVIRONMENT_IS_PTHREAD =
        ENVIRONMENT_IS_WORKER && worker_threads["workerData"] == "em-pthread";
    }
    var ENVIRONMENT_IS_WASM_WORKER = Module["$ww"];
    if (!Module["expectedDataFileDownloads"]) {
      Module["expectedDataFileDownloads"] = 0;
    }
    Module["expectedDataFileDownloads"]++;
    (() => {
      var isPthread =
        typeof ENVIRONMENT_IS_PTHREAD != "undefined" && ENVIRONMENT_IS_PTHREAD;
      var isWasmWorker =
        typeof ENVIRONMENT_IS_WASM_WORKER != "undefined" &&
        ENVIRONMENT_IS_WASM_WORKER;
      if (isPthread || isWasmWorker) return;
      function loadPackage(metadata) {
        var PACKAGE_PATH = "";
        if (typeof window === "object") {
          PACKAGE_PATH = window["encodeURIComponent"](
            window.location.pathname
              .toString()
              .substring(
                0,
                window.location.pathname.toString().lastIndexOf("/")
              ) + "/"
          );
        } else if (
          typeof process === "undefined" &&
          typeof location !== "undefined"
        ) {
          PACKAGE_PATH = encodeURIComponent(
            location.pathname
              .toString()
              .substring(0, location.pathname.toString().lastIndexOf("/")) + "/"
          );
        }
        //var PACKAGE_NAME =
        //"/Users/fmammoli/Developer/zan-patches/Trovao/WebPatch/pd4web.data";
        //Also had to change this line to use the package name from the module
        var PACKAGE_NAME = Module["packageName"];
        var REMOTE_PACKAGE_BASE = "pd4web.data";
        if (
          typeof Module["locateFilePackage"] === "function" &&
          !Module["locateFile"]
        ) {
          Module["locateFile"] = Module["locateFilePackage"];
          err(
            "warning: you defined Module.locateFilePackage, that has been renamed to Module.locateFile (using your locateFilePackage for now)"
          );
        }
        var REMOTE_PACKAGE_NAME = Module["locateFile"]
          ? Module["locateFile"](REMOTE_PACKAGE_BASE, "")
          : REMOTE_PACKAGE_BASE;
        // Had to add this line so the package name comes dynamically as an argument from the module
        REMOTE_PACKAGE_NAME = Module["packageName"];
        var REMOTE_PACKAGE_SIZE = metadata["remote_package_size"];
        function fetchRemotePackage(
          packageName,
          packageSize,
          callback,
          errback
        ) {
          if (
            typeof process === "object" &&
            typeof process.versions === "object" &&
            typeof process.versions.node === "string"
          ) {
            require("fs").readFile(packageName, (err, contents) => {
              if (err) {
                errback(err);
              } else {
                callback(contents.buffer);
              }
            });
            return;
          }
          Module["dataFileDownloads"] ??= {};
          fetch(packageName)
            .catch((cause) =>
              Promise.reject(
                new Error(`Network Error: ${packageName}`, { cause })
              )
            )
            .then((response) => {
              if (!response.ok) {
                return Promise.reject(
                  new Error(`${response.status}: ${response.url}`)
                );
              }
              if (!response.body && response.arrayBuffer) {
                return response.arrayBuffer().then(callback);
              }
              const reader = response.body.getReader();
              const iterate = () =>
                reader
                  .read()
                  .then(handleChunk)
                  .catch((cause) =>
                    Promise.reject(
                      new Error(
                        `Unexpected error while handling : ${response.url} ${cause}`,
                        { cause }
                      )
                    )
                  );
              const chunks = [];
              const headers = response.headers;
              const total = Number(
                headers.get("Content-Length") ?? packageSize
              );
              let loaded = 0;
              const handleChunk = ({ done, value }) => {
                if (!done) {
                  chunks.push(value);
                  loaded += value.length;
                  Module["dataFileDownloads"][packageName] = { loaded, total };
                  let totalLoaded = 0;
                  let totalSize = 0;
                  for (const download of Object.values(
                    Module["dataFileDownloads"]
                  )) {
                    totalLoaded += download.loaded;
                    totalSize += download.total;
                  }
                  Module["setStatus"]?.(
                    `Downloading data... (${totalLoaded}/${totalSize})`
                  );
                  return iterate();
                } else {
                  const packageData = new Uint8Array(
                    chunks.map((c) => c.length).reduce((a, b) => a + b, 0)
                  );
                  let offset = 0;
                  for (const chunk of chunks) {
                    packageData.set(chunk, offset);
                    offset += chunk.length;
                  }
                  callback(packageData.buffer);
                }
              };
              Module["setStatus"]?.("Downloading data...");
              return iterate();
            });
        }
        function handleError(error) {
          console.error("package error:", error);
        }
        var fetchedCallback = null;
        var fetched = Module["getPreloadedPackage"]
          ? Module["getPreloadedPackage"](
              REMOTE_PACKAGE_NAME,
              REMOTE_PACKAGE_SIZE
            )
          : null;
        if (!fetched)
          fetchRemotePackage(
            REMOTE_PACKAGE_NAME,
            REMOTE_PACKAGE_SIZE,
            (data) => {
              if (fetchedCallback) {
                fetchedCallback(data);
                fetchedCallback = null;
              } else {
                fetched = data;
              }
            },
            handleError
          );
        function runWithFS(Module) {
          function assert(check, msg) {
            if (!check) throw msg + new Error().stack;
          }
          Module["FS_createPath"]("/", "Libs", true, true);
          function DataRequest(start, end, audio) {
            this.start = start;
            this.end = end;
            this.audio = audio;
          }
          DataRequest.prototype = {
            requests: {},
            open: function (mode, name) {
              this.name = name;
              this.requests[name] = this;
              Module["addRunDependency"](`fp ${this.name}`);
            },
            send: function () {},
            onload: function () {
              var byteArray = this.byteArray.subarray(this.start, this.end);
              this.finish(byteArray);
            },
            finish: function (byteArray) {
              var that = this;
              Module["FS_createDataFile"](
                this.name,
                null,
                byteArray,
                true,
                true,
                true
              );
              Module["removeRunDependency"](`fp ${that.name}`);
              this.requests[this.name] = null;
            },
          };
          var files = metadata["files"];
          for (var i = 0; i < files.length; ++i) {
            new DataRequest(
              files[i]["start"],
              files[i]["end"],
              files[i]["audio"] || 0
            ).open("GET", files[i]["filename"]);
          }
          function processPackageData(arrayBuffer) {
            assert(arrayBuffer, "Loading data file failed.");
            assert(
              arrayBuffer.constructor.name === ArrayBuffer.name,
              "bad input to processPackageData"
            );
            var byteArray = new Uint8Array(arrayBuffer);
            DataRequest.prototype.byteArray = byteArray;
            var files = metadata["files"];
            for (var i = 0; i < files.length; ++i) {
              DataRequest.prototype.requests[files[i].filename].onload();
            }

            Module["removeRunDependency"](
              //"datafile_/Users/fmammoli/Developer/zan-patches/Trovao/WebPatch/pd4web.data"
              `datafile_${Module["packageName"]}`
            );
          }
          Module["addRunDependency"](
            //"datafile_/Users/fmammoli/Developer/zan-patches/Trovao/WebPatch/pd4web.data"
            `datafile_${Module["packageName"]}`
          );
          if (!Module["preloadResults"]) Module["preloadResults"] = {};
          Module["preloadResults"][PACKAGE_NAME] = { fromCache: false };
          if (fetched) {
            processPackageData(fetched);
            fetched = null;
          } else {
            fetchedCallback = processPackageData;
          }
        }
        if (Module["calledRun"]) {
          runWithFS(Module);
        } else {
          if (!Module["preRun"]) Module["preRun"] = [];
          Module["preRun"].push(runWithFS);
        }
      }
      loadPackage({
        files: [
          { filename: "/Libs/distance.pd", start: 0, end: 1019 },
          { filename: "/Libs/strike-pattern.pd", start: 1019, end: 1980 },
          { filename: "/Libs/strikeSound.pd", start: 1980, end: 2831 },
          { filename: "/Libs/udly.pd", start: 2831, end: 4493 },
          { filename: "/index.pd", start: 4493, end: 10526 },
        ],
        remote_package_size: 10526,
      });
    })();
    var moduleOverrides = Object.assign({}, Module);
    var arguments_ = [];
    var thisProgram = "./this.program";
    var quit_ = (status, toThrow) => {
      throw toThrow;
    };
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    var readAsync, readBinary;
    if (ENVIRONMENT_IS_NODE) {
      var fs = require("fs");
      var nodePath = require("path");
      scriptDirectory = __dirname + "/";
      readBinary = (filename) => {
        filename = isFileURI(filename)
          ? new URL(filename)
          : nodePath.normalize(filename);
        var ret = fs.readFileSync(filename);
        return ret;
      };
      readAsync = (filename, binary = true) => {
        filename = isFileURI(filename)
          ? new URL(filename)
          : nodePath.normalize(filename);
        return new Promise((resolve, reject) => {
          fs.readFile(filename, binary ? undefined : "utf8", (err, data) => {
            if (err) reject(err);
            else resolve(binary ? data.buffer : data);
          });
        });
      };
      if (!Module["thisProgram"] && process.argv.length > 1) {
        thisProgram = process.argv[1].replace(/\\/g, "/");
      }
      arguments_ = process.argv.slice(2);
      quit_ = (status, toThrow) => {
        process.exitCode = status;
        throw toThrow;
      };
    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (typeof document != "undefined" && document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      if (_scriptName) {
        scriptDirectory = _scriptName;
      }
      if (scriptDirectory.startsWith("blob:")) {
        scriptDirectory = "";
      } else {
        scriptDirectory = scriptDirectory.substr(
          0,
          scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1
        );
      }
      if (!ENVIRONMENT_IS_NODE) {
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = (url) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(xhr.response);
          };
        }
        readAsync = (url) => {
          if (isFileURI(url)) {
            return new Promise((resolve, reject) => {
              var xhr = new XMLHttpRequest();
              xhr.open("GET", url, true);
              xhr.responseType = "arraybuffer";
              xhr.onload = () => {
                if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
                  resolve(xhr.response);
                  return;
                }
                reject(xhr.status);
              };
              xhr.onerror = reject;
              xhr.send(null);
            });
          }
          return fetch(url, { credentials: "same-origin" }).then((response) => {
            if (response.ok) {
              return response.arrayBuffer();
            }
            return Promise.reject(
              new Error(response.status + " : " + response.url)
            );
          });
        };
      }
    } else {
    }
    var defaultPrint = console.log.bind(console);
    var defaultPrintErr = console.error.bind(console);
    if (ENVIRONMENT_IS_NODE) {
      defaultPrint = (...args) => fs.writeSync(1, args.join(" ") + "\n");
      defaultPrintErr = (...args) => fs.writeSync(2, args.join(" ") + "\n");
    }
    var out = Module["print"] || defaultPrint;
    var err = Module["printErr"] || defaultPrintErr;
    Object.assign(Module, moduleOverrides);
    moduleOverrides = null;
    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    var wasmBinary = Module["wasmBinary"];
    var wasmMemory;
    var wasmModule;
    var ABORT = false;
    var EXITSTATUS;
    function assert(condition, text) {
      if (!condition) {
        abort(text);
      }
    }
    var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
    function updateMemoryViews() {
      var b = wasmMemory.buffer;
      Module["HEAP8"] = HEAP8 = new Int8Array(b);
      Module["HEAP16"] = HEAP16 = new Int16Array(b);
      Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
      Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
      Module["HEAP32"] = HEAP32 = new Int32Array(b);
      Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
      Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
      Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
    }
    if (ENVIRONMENT_IS_PTHREAD) {
      var wasmPromiseResolve;
      var wasmPromiseReject;
      if (ENVIRONMENT_IS_NODE) {
        var parentPort = worker_threads["parentPort"];
        parentPort.on("message", (data) => onmessage({ data }));
        Object.assign(globalThis, {
          self: global,
          importScripts: () => {},
          postMessage: (msg) => parentPort.postMessage(msg),
        });
      }
      var initializedJS = false;
      function threadPrintErr(...args) {
        var text = args.join(" ");
        if (ENVIRONMENT_IS_NODE) {
          fs.writeSync(2, text + "\n");
          return;
        }
        console.error(text);
      }
      if (!Module["printErr"]) err = threadPrintErr;
      function threadAlert(...args) {
        var text = args.join(" ");
        postMessage({ cmd: "alert", text, threadId: _pthread_self() });
      }
      self.alert = threadAlert;
      Module["instantiateWasm"] = (info, receiveInstance) =>
        new Promise((resolve, reject) => {
          wasmPromiseResolve = (module) => {
            var instance = new WebAssembly.Instance(module, getWasmImports());
            receiveInstance(instance);
            resolve();
          };
          wasmPromiseReject = reject;
        });
      self.onunhandledrejection = (e) => {
        throw e.reason || e;
      };
      function handleMessage(e) {
        try {
          var msgData = e["data"];
          var cmd = msgData.cmd;
          if (cmd === "load") {
            let messageQueue = [];
            self.onmessage = (e) => messageQueue.push(e);
            self.startWorker = (instance) => {
              postMessage({ cmd: "loaded" });
              for (let msg of messageQueue) {
                handleMessage(msg);
              }
              self.onmessage = handleMessage;
            };
            for (const handler of msgData.handlers) {
              if (!Module[handler] || Module[handler].proxy) {
                Module[handler] = (...args) => {
                  postMessage({ cmd: "callHandler", handler, args });
                };
                if (handler == "print") out = Module[handler];
                if (handler == "printErr") err = Module[handler];
              }
            }
            wasmMemory = msgData.wasmMemory;
            updateMemoryViews();
            wasmPromiseResolve(msgData.wasmModule);
          } else if (cmd === "run") {
            establishStackSpace(msgData.pthread_ptr);
            __emscripten_thread_init(msgData.pthread_ptr, 0, 0, 1, 0, 0);
            PThread.receiveObjectTransfer(msgData);
            PThread.threadInitTLS();
            __emscripten_thread_mailbox_await(msgData.pthread_ptr);
            if (!initializedJS) {
              __embind_initialize_bindings();
              initializedJS = true;
            }
            try {
              invokeEntryPoint(msgData.start_routine, msgData.arg);
            } catch (ex) {
              if (ex != "unwind") {
                throw ex;
              }
            }
          } else if (msgData.target === "setimmediate") {
          } else if (cmd === "checkMailbox") {
            if (initializedJS) {
              checkMailbox();
            }
          } else if (cmd) {
            err(`worker: received unknown command ${cmd}`);
            err(msgData);
          }
        } catch (ex) {
          __emscripten_thread_crashed();
          throw ex;
        }
      }
      self.onmessage = handleMessage;
    }
    if (!ENVIRONMENT_IS_PTHREAD) {
      if (Module["wasmMemory"]) {
        wasmMemory = Module["wasmMemory"];
      } else {
        var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 134217728;
        wasmMemory = new WebAssembly.Memory({
          initial: INITIAL_MEMORY / 65536,
          maximum: INITIAL_MEMORY / 65536,
          shared: true,
        });
        if (!(wasmMemory.buffer instanceof SharedArrayBuffer)) {
          err(
            "requested a shared WebAssembly.Memory but the returned buffer is not a SharedArrayBuffer, indicating that while the browser has SharedArrayBuffer it does not have WebAssembly threads support - you may need to set a flag"
          );
          if (ENVIRONMENT_IS_NODE) {
            err(
              "(on node you may need: --experimental-wasm-threads --experimental-wasm-bulk-memory and/or recent version)"
            );
          }
          throw Error("bad memory");
        }
      }
      updateMemoryViews();
    }
    var __ATPRERUN__ = [];
    var __ATINIT__ = [];
    var __ATMAIN__ = [];
    var __ATPOSTRUN__ = [];
    var runtimeInitialized = false;
    function preRun() {
      if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function")
          Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
          addOnPreRun(Module["preRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPRERUN__);
    }
    function initRuntime() {
      runtimeInitialized = true;
      if (ENVIRONMENT_IS_WASM_WORKER) return _wasmWorkerInitializeRuntime();
      if (ENVIRONMENT_IS_PTHREAD) return;
      callRuntimeCallbacks(__ATINIT__);
    }
    function preMain() {
      if (ENVIRONMENT_IS_PTHREAD) return;
      callRuntimeCallbacks(__ATMAIN__);
    }
    function postRun() {
      if (ENVIRONMENT_IS_PTHREAD) return;
      if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function")
          Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
          addOnPostRun(Module["postRun"].shift());
        }
      }
      callRuntimeCallbacks(__ATPOSTRUN__);
    }
    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb);
    }
    function addOnInit(cb) {
      __ATINIT__.unshift(cb);
    }
    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb);
    }
    var runDependencies = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled = null;
    function getUniqueRunDependency(id) {
      return id;
    }
    function addRunDependency(id) {
      runDependencies++;
      Module["monitorRunDependencies"]?.(runDependencies);
    }
    function removeRunDependency(id) {
      runDependencies--;
      Module["monitorRunDependencies"]?.(runDependencies);
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }
    function abort(what) {
      Module["onAbort"]?.(what);
      what = "Aborted(" + what + ")";
      err(what);
      ABORT = true;
      what += ". Build with -sASSERTIONS for more info.";
      var e = new WebAssembly.RuntimeError(what);
      readyPromiseReject(e);
      throw e;
    }
    var dataURIPrefix = "data:application/octet-stream;base64,";
    var isDataURI = (filename) => filename.startsWith(dataURIPrefix);
    var isFileURI = (filename) => filename.startsWith("file://");
    function findWasmBinary() {
      var f = "/pd4web/pd4web.wasm";
      // if (!isDataURI(f)) {
      //   return locateFile(f);
      // }
      return f;
    }
    var wasmBinaryFile;
    function getBinarySync(file) {
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary);
      }
      if (readBinary) {
        return readBinary(file);
      }
      throw "both async and sync fetching of the wasm failed";
    }
    function getBinaryPromise(binaryFile) {
      if (!wasmBinary) {
        return readAsync(binaryFile).then(
          (response) => new Uint8Array(response),
          () => getBinarySync(binaryFile)
        );
      }
      return Promise.resolve().then(() => getBinarySync(binaryFile));
    }
    function instantiateArrayBuffer(binaryFile, imports, receiver) {
      return getBinaryPromise(binaryFile)
        .then((binary) => WebAssembly.instantiate(binary, imports))
        .then(receiver, (reason) => {
          err(`failed to asynchronously prepare wasm: ${reason}`);
          abort(reason);
        });
    }
    function instantiateAsync(binary, binaryFile, imports, callback) {
      if (
        !binary &&
        typeof WebAssembly.instantiateStreaming == "function" &&
        !isDataURI(binaryFile) &&
        !isFileURI(binaryFile) &&
        !ENVIRONMENT_IS_NODE &&
        typeof fetch == "function"
      ) {
        return fetch(binaryFile, { credentials: "same-origin" }).then(
          (response) => {
            var result = WebAssembly.instantiateStreaming(response, imports);
            return result.then(callback, function (reason) {
              err(`wasm streaming compile failed: ${reason}`);
              err("falling back to ArrayBuffer instantiation");
              return instantiateArrayBuffer(binaryFile, imports, callback);
            });
          }
        );
      }
      return instantiateArrayBuffer(binaryFile, imports, callback);
    }
    function getWasmImports() {
      assignWasmImports();
      return { a: wasmImports };
    }
    function createWasm() {
      var info = getWasmImports();
      function receiveInstance(instance, module) {
        wasmExports = instance.exports;
        registerTLSInit(wasmExports["Ea"]);
        wasmTable = wasmExports["Fa"];
        Module["wasmTable"] = wasmTable;
        addOnInit(wasmExports["va"]);
        wasmModule = module;
        removeRunDependency("wasm-instantiate");
        return wasmExports;
      }
      addRunDependency("wasm-instantiate");
      function receiveInstantiationResult(result) {
        receiveInstance(result["instance"], result["module"]);
      }
      if (Module["instantiateWasm"]) {
        try {
          return Module["instantiateWasm"](info, receiveInstance);
        } catch (e) {
          err(`Module.instantiateWasm callback failed with error: ${e}`);
          readyPromiseReject(e);
        }
      }
      wasmBinaryFile ??= findWasmBinary();
      instantiateAsync(
        wasmBinary,
        wasmBinaryFile,
        info,
        receiveInstantiationResult
      ).catch(readyPromiseReject);
      return {};
    }
    var tempDouble;
    function _JS_pd4webCppClass(Pd4Web) {
      console.log("Received Pd4Web pointer:", Pd4Web);
    }
    function _JS_sendList() {
      if (typeof Pd4Web.GuiReceivers === "undefined") {
        Pd4Web.GuiReceivers = {};
      }
      Pd4Web.sendList = function (r, vec) {
        const vecLength = vec.length;
        var ok = Pd4Web._startMessage(r, vecLength);
        if (!ok) {
          console.error("Failed to start message");
          return;
        }
        for (let i = 0; i < vecLength; i++) {
          if (typeof vec[i] === "string") {
            Pd4Web._addSymbol(r, vec[i]);
          } else if (typeof vec[i] === "number") {
            Pd4Web._addFloat(r, vec[i]);
          } else {
            console.error("Invalid type");
          }
        }
        Pd4Web._finishMessage(r);
      };
    }
    function _JS_onReceived() {
      Pd4Web.onBangReceived = function (receiver, myFunc) {
        if (typeof Pd4Web._userBangFunc === "undefined") {
          Pd4Web._userBangFunc = {};
        }
        const paramCount = myFunc.length;
        if (paramCount !== 0) {
          console.error(
            "Invalid number of arguments for function, expected 0 arguments"
          );
          return;
        }
        Pd4Web.bindReceiver(receiver);
        Pd4Web._userBangFunc[receiver] = myFunc;
      };
      Pd4Web.onFloatReceived = function (receiver, myFunc) {
        if (typeof Pd4Web._userFloatFunc === "undefined") {
          Pd4Web._userFloatFunc = {};
        }
        const paramCount = myFunc.length;
        if (paramCount !== 1) {
          console.error(
            "Invalid number of arguments for function, expected 1, just the float received"
          );
          return;
        }
        Pd4Web.bindReceiver(receiver);
        Pd4Web._userFloatFunc[receiver] = myFunc;
      };
      Pd4Web.onSymbolReceived = function (receiver, myFunc) {
        if (typeof Pd4Web._userSymbolFunc === "undefined") {
          Pd4Web._userSymbolFunc = {};
        }
        const paramCount = myFunc.length;
        if (paramCount !== 1) {
          console.error(
            "Invalid number of arguments for function. Required 1, just the symbol (aka string) received"
          );
          return;
        }
        Pd4Web.bindReceiver(receiver);
        Pd4Web._userSymbolFunc[receiver] = myFunc;
      };
      Pd4Web.onListReceived = function (receiver, myFunc) {
        if (typeof Pd4Web._userListFunc === "undefined") {
          Pd4Web._userListFunc = {};
        }
        const paramCount = myFunc.length;
        if (paramCount !== 1) {
          console.error(
            "Invalid number of arguments for function. Required 1, just the list received"
          );
          return;
        }
        Pd4Web.bindReceiver(receiver);
        Pd4Web._userListFunc[receiver] = myFunc;
      };
    }
    function _JS_alert(msg) {
      alert(UTF8ToString(msg));
    }
    function _JS_addAlertOnError() {
      window.addEventListener("error", function (event) {
        console.log(event.filename);
      });
    }
    function _JS_post(msg) {
      console.log(UTF8ToString(msg));
    }
    function _JS_getMicAccess(audioContext, audioWorkletNode, nInCh) {
      Pd4WebAudioContext = emscriptenGetAudioObject(audioContext);
      Pd4WebAudioWorkletNode = emscriptenGetAudioObject(audioWorkletNode);
      async function _GetMicAccess(stream) {
        try {
          const SourceNode = Pd4WebAudioContext.createMediaStreamSource(stream);
          SourceNode.connect(Pd4WebAudioWorkletNode);
          Pd4WebAudioWorkletNode.connect(Pd4WebAudioContext.destination);
        } catch (err) {
          alert(err);
        }
      }
      if (nInCh > 0) {
        navigator.mediaDevices
          .getUserMedia({
            video: false,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          })
          .then((stream) => _GetMicAccess(stream));
      } else {
        Pd4WebAudioWorkletNode.connect(Pd4WebAudioContext.destination);
      }
    }
    function _JS_suspendAudioWorkLet(audioContext) {
      Pd4WebAudioContext = emscriptenGetAudioObject(audioContext);
      Pd4WebAudioContext.suspend();
    }
    function _JS_receiveBang(r) {
      var source = UTF8ToString(r);
      if (source in Pd4Web.GuiReceivers) {
        for (const data of Pd4Web.GuiReceivers[source]) {
          switch (data.type) {
            case "bng":
              GuiBngUpdateCircle(data);
              break;
            case "tgl":
              data.value = data.value ? 0 : data.default_value;
              GuiTglUpdateCross(data);
              break;
            case "vsl":
            case "hsl":
              GuiSliderBang(data);
              break;
            case "vradio":
            case "hradio":
              Pd4Web.sendFloat(data.send, data.value);
              break;
          }
        }
      } else {
        let bangFunc = Pd4Web._userBangFunc[source];
        if (typeof bangFunc === "function") {
          bangFunc();
        }
      }
    }
    function _JS_receiveFloat(r, f) {
      var source = UTF8ToString(r);
      if (source in Pd4Web.GuiReceivers) {
        for (const data of Pd4Web.GuiReceivers[source]) {
          switch (data.type) {
            case "bng":
              GuiBngUpdateCircle(data);
              break;
            case "tgl":
              data.value = data.value ? 0 : data.default_value;
              GuiTglUpdateCross(data);
              break;
            case "vsl":
            case "hsl":
              GuiSliderSet(data, f);
              GuiSliderBang(data);
              break;
            case "nbx":
              GuiNbxUpdateNumber(data, f);
              break;
            case "vradio":
            case "hradio":
              data.value = Math.min(
                Math.max(Math.floor(f), 0),
                data.number - 1
              );
              GuiRadioUpdateButton(data);
              Pd4Web.sendFloat(data.send, data.value);
              break;
            case "vu":
              data.value = f;
              GuiVuUpdateGain(data);
              break;
          }
        }
      } else {
        let floatFunc = Pd4Web._userFloatFunc[source];
        if (typeof floatFunc === "function") {
          floatFunc(f);
        }
      }
    }
    function _JS_receiveSymbol(r, s) {
      var source = UTF8ToString(r);
      var symbol = UTF8ToString(s);
      if (source in Pd4Web.GuiReceivers) {
        for (const data of Pd4Web.GuiReceivers[source]) {
          switch (data.type) {
            case "bng":
              GuiBngUpdateCircle(data);
              break;
          }
        }
      } else {
        let symbolFunc = Pd4Web._userSymbolFunc[source];
        if (typeof symbolFunc === "function") {
          symbolFunc(symbol);
        }
      }
    }
    function _JS_receiveList(r) {
      var source = UTF8ToString(r);
      if (source in Pd4Web.GuiReceivers) {
        return;
      } else {
        let listFunc = Pd4Web._userListFunc[source];
        const listSize = Pd4Web._getReceivedListSize(source);
        var pdList = [];
        for (let i = 0; i < listSize; i++) {
          let type = Pd4Web._getItemFromListType(source, i);
          if (type === "float") {
            pdList.push(Pd4Web._getItemFromListFloat(source, i));
          } else if (type === "symbol") {
            pdList.push(Pd4Web._getItemFromListSymbol(source, i));
          } else {
            console.error("Invalid type");
          }
        }
        if (typeof listFunc === "function") {
          listFunc(pdList);
        }
      }
    }
    function _JS_receiveMessage(r) {
      var source = UTF8ToString(r);
      const listSize = Pd4Web._getReceivedListSize(source);
      var pdList = [];
      for (let i = 0; i < listSize; i++) {
        let type = Pd4Web._getItemFromListType(source, i);
        if (type === "float") {
          pdList.push(Pd4Web._getItemFromListFloat(source, i));
        } else if (type === "symbol") {
          pdList.push(Pd4Web._getItemFromListSymbol(source, i));
        } else {
          console.error("Invalid type");
        }
      }
      if (source in Pd4Web.GuiReceivers) {
        let sel = Pd4Web._getMessageSelector(source);
        MessageListener(source, sel, pdList);
        return;
      } else {
        console.error("Not implemented");
      }
    }
    function ExitStatus(status) {
      this.name = "ExitStatus";
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
    var terminateWorker = (worker) => {
      worker.terminate();
      worker.onmessage = (e) => {};
    };
    var cleanupThread = (pthread_ptr) => {
      var worker = PThread.pthreads[pthread_ptr];
      PThread.returnWorkerToPool(worker);
    };
    var spawnThread = (threadParams) => {
      var worker = PThread.getNewWorker();
      if (!worker) {
        return 6;
      }
      PThread.runningWorkers.push(worker);
      PThread.pthreads[threadParams.pthread_ptr] = worker;
      worker.pthread_ptr = threadParams.pthread_ptr;
      var msg = {
        cmd: "run",
        start_routine: threadParams.startRoutine,
        arg: threadParams.arg,
        pthread_ptr: threadParams.pthread_ptr,
      };
      if (ENVIRONMENT_IS_NODE) {
        worker.unref();
      }
      worker.postMessage(msg, threadParams.transferList);
      return 0;
    };
    var runtimeKeepaliveCounter = 0;
    var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
    var stackSave = () => _emscripten_stack_get_current();
    var stackRestore = (val) => __emscripten_stack_restore(val);
    var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
    var convertI32PairToI53Checked = (lo, hi) =>
      (hi + 2097152) >>> 0 < 4194305 - !!lo
        ? (lo >>> 0) + hi * 4294967296
        : NaN;
    var proxyToMainThread = (funcIndex, emAsmAddr, sync, ...callArgs) => {
      var serializedNumCallArgs = callArgs.length;
      var sp = stackSave();
      var args = stackAlloc(serializedNumCallArgs * 8);
      var b = args >> 3;
      for (var i = 0; i < callArgs.length; i++) {
        var arg = callArgs[i];
        HEAPF64[b + i] = arg;
      }
      var rtn = __emscripten_run_on_main_thread_js(
        funcIndex,
        emAsmAddr,
        serializedNumCallArgs,
        args,
        sync
      );
      stackRestore(sp);
      return rtn;
    };
    function _proc_exit(code) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(0, 0, 1, code);
      EXITSTATUS = code;
      if (!keepRuntimeAlive()) {
        PThread.terminateAllThreads();
        Module["onExit"]?.(code);
        ABORT = true;
      }
      quit_(code, new ExitStatus(code));
    }
    var handleException = (e) => {
      if (e instanceof ExitStatus || e == "unwind") {
        return EXITSTATUS;
      }
      quit_(1, e);
    };
    function exitOnMainThread(returnCode) {
      if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(1, 0, 0, returnCode);
      _exit(returnCode);
    }
    var exitJS = (status, implicit) => {
      EXITSTATUS = status;
      if (ENVIRONMENT_IS_PTHREAD) {
        exitOnMainThread(status);
        throw "unwind";
      }
      _proc_exit(status);
    };
    var _exit = exitJS;
    var PThread = {
      unusedWorkers: [],
      runningWorkers: [],
      tlsInitFunctions: [],
      pthreads: {},
      init() {
        if (
          !(
            ENVIRONMENT_IS_PTHREAD ||
            ENVIRONMENT_IS_WASM_WORKER ||
            ENVIRONMENT_IS_AUDIO_WORKLET
          )
        ) {
          PThread.initMainThread();
        }
      },
      initMainThread() {
        var pthreadPoolSize = 4;
        while (pthreadPoolSize--) {
          PThread.allocateUnusedWorker();
        }
        addOnPreRun(() => {
          addRunDependency("loading-workers");
          PThread.loadWasmModuleToAllWorkers(() =>
            removeRunDependency("loading-workers")
          );
        });
      },
      terminateAllThreads: () => {
        for (var worker of PThread.runningWorkers) {
          terminateWorker(worker);
        }
        for (var worker of PThread.unusedWorkers) {
          terminateWorker(worker);
        }
        PThread.unusedWorkers = [];
        PThread.runningWorkers = [];
        PThread.pthreads = [];
      },
      returnWorkerToPool: (worker) => {
        var pthread_ptr = worker.pthread_ptr;
        delete PThread.pthreads[pthread_ptr];
        PThread.unusedWorkers.push(worker);
        PThread.runningWorkers.splice(
          PThread.runningWorkers.indexOf(worker),
          1
        );
        worker.pthread_ptr = 0;
        __emscripten_thread_free_data(pthread_ptr);
      },
      receiveObjectTransfer(data) {},
      threadInitTLS() {
        PThread.tlsInitFunctions.forEach((f) => f());
      },
      loadWasmModuleToWorker: (worker) =>
        new Promise((onFinishedLoading) => {
          worker.onmessage = (e) => {
            var d = e["data"];
            var cmd = d.cmd;
            if (d.targetThread && d.targetThread != _pthread_self()) {
              var targetWorker = PThread.pthreads[d.targetThread];
              if (targetWorker) {
                targetWorker.postMessage(d, d.transferList);
              } else {
                err(
                  `Internal error! Worker sent a message "${cmd}" to target pthread ${d.targetThread}, but that thread no longer exists!`
                );
              }
              return;
            }
            if (cmd === "checkMailbox") {
              checkMailbox();
            } else if (cmd === "spawnThread") {
              spawnThread(d);
            } else if (cmd === "cleanupThread") {
              cleanupThread(d.thread);
            } else if (cmd === "loaded") {
              worker.loaded = true;
              if (ENVIRONMENT_IS_NODE && !worker.pthread_ptr) {
                worker.unref();
              }
              onFinishedLoading(worker);
            } else if (cmd === "alert") {
              alert(`Thread ${d.threadId}: ${d.text}`);
            } else if (d.target === "setimmediate") {
              worker.postMessage(d);
            } else if (cmd === "callHandler") {
              Module[d.handler](...d.args);
            } else if (cmd) {
              err(`worker sent an unknown command ${cmd}`);
            }
          };
          worker.onerror = (e) => {
            var message = "worker sent an error!";
            err(`${message} ${e.filename}:${e.lineno}: ${e.message}`);
            throw e;
          };
          if (ENVIRONMENT_IS_NODE) {
            worker.on("message", (data) => worker.onmessage({ data }));
            worker.on("error", (e) => worker.onerror(e));
          }
          var handlers = [];
          var knownHandlers = ["onExit", "onAbort", "print", "printErr"];
          for (var handler of knownHandlers) {
            if (Module.propertyIsEnumerable(handler)) {
              handlers.push(handler);
            }
          }
          worker.postMessage({ cmd: "load", handlers, wasmMemory, wasmModule });
        }),
      loadWasmModuleToAllWorkers(onMaybeReady) {
        if (ENVIRONMENT_IS_PTHREAD || ENVIRONMENT_IS_WASM_WORKER) {
          return onMaybeReady();
        }
        let pthreadPoolReady = Promise.all(
          PThread.unusedWorkers.map(PThread.loadWasmModuleToWorker)
        );
        pthreadPoolReady.then(onMaybeReady);
      },
      allocateUnusedWorker() {
        var worker;
        var workerOptions = { workerData: "em-pthread", name: "em-pthread" };
        var pthreadMainJs = _scriptName;
        if (Module["mainScriptUrlOrBlob"]) {
          pthreadMainJs = Module["mainScriptUrlOrBlob"];
          if (typeof pthreadMainJs != "string") {
            pthreadMainJs = URL.createObjectURL(pthreadMainJs);
          }
        }
        worker = new Worker(pthreadMainJs, workerOptions);
        PThread.unusedWorkers.push(worker);
      },
      getNewWorker() {
        if (PThread.unusedWorkers.length == 0) {
          PThread.allocateUnusedWorker();
          PThread.loadWasmModuleToWorker(PThread.unusedWorkers[0]);
        }
        return PThread.unusedWorkers.pop();
      },
    };
    var _wasmWorkerDelayedMessageQueue = [];
    var wasmTableMirror = [];
    var wasmTable;
    var getWasmTableEntry = (funcPtr) => {
      var func = wasmTableMirror[funcPtr];
      if (!func) {
        if (funcPtr >= wasmTableMirror.length)
          wasmTableMirror.length = funcPtr + 1;
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
      }
      return func;
    };
    var _wasmWorkerRunPostMessage = (e) => {
      let data = ENVIRONMENT_IS_NODE ? e : e.data;
      let wasmCall = data["_wsc"];
      wasmCall && getWasmTableEntry(wasmCall)(...data["x"]);
    };
    var _wasmWorkerAppendToQueue = (e) => {
      _wasmWorkerDelayedMessageQueue.push(e);
    };
    var _wasmWorkerInitializeRuntime = () => {
      let m = Module;
      __emscripten_wasm_worker_initialize(m["sb"], m["sz"]);
      ___set_thread_state(
        0,
        0,
        0,
        typeof AudioWorkletGlobalScope === "undefined"
      );
      if (typeof AudioWorkletGlobalScope === "undefined") {
        removeEventListener("message", _wasmWorkerAppendToQueue);
        _wasmWorkerDelayedMessageQueue = _wasmWorkerDelayedMessageQueue.forEach(
          _wasmWorkerRunPostMessage
        );
        addEventListener("message", _wasmWorkerRunPostMessage);
      }
    };
    var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        callbacks.shift()(Module);
      }
    };
    var establishStackSpace = (pthread_ptr) => {
      var stackHigh = HEAPU32[(pthread_ptr + 52) >> 2];
      var stackSize = HEAPU32[(pthread_ptr + 56) >> 2];
      var stackLow = stackHigh - stackSize;
      _emscripten_stack_set_limits(stackHigh, stackLow);
      stackRestore(stackHigh);
    };
    var invokeEntryPoint = (ptr, arg) => {
      runtimeKeepaliveCounter = 0;
      noExitRuntime = 0;
      var result = getWasmTableEntry(ptr)(arg);
      function finish(result) {
        if (keepRuntimeAlive()) {
          EXITSTATUS = result;
        } else {
          __emscripten_thread_exit(result);
        }
      }
      finish(result);
    };
    var noExitRuntime = Module["noExitRuntime"] || true;
    var registerTLSInit = (tlsInitFunc) =>
      PThread.tlsInitFunctions.push(tlsInitFunc);
    var ___call_sighandler = (fp, sig) => getWasmTableEntry(fp)(sig);
    class ExceptionInfo {
      constructor(excPtr) {
        this.excPtr = excPtr;
        this.ptr = excPtr - 24;
      }
      set_type(type) {
        HEAPU32[(this.ptr + 4) >> 2] = type;
      }
      get_type() {
        return HEAPU32[(this.ptr + 4) >> 2];
      }
      set_destructor(destructor) {
        HEAPU32[(this.ptr + 8) >> 2] = destructor;
      }
      get_destructor() {
        return HEAPU32[(this.ptr + 8) >> 2];
      }
      set_caught(caught) {
        caught = caught ? 1 : 0;
        HEAP8[this.ptr + 12] = caught;
      }
      get_caught() {
        return HEAP8[this.ptr + 12] != 0;
      }
      set_rethrown(rethrown) {
        rethrown = rethrown ? 1 : 0;
        HEAP8[this.ptr + 13] = rethrown;
      }
      get_rethrown() {
        return HEAP8[this.ptr + 13] != 0;
      }
      init(type, destructor) {
        this.set_adjusted_ptr(0);
        this.set_type(type);
        this.set_destructor(destructor);
      }
      set_adjusted_ptr(adjustedPtr) {
        HEAPU32[(this.ptr + 16) >> 2] = adjustedPtr;
      }
      get_adjusted_ptr() {
        return HEAPU32[(this.ptr + 16) >> 2];
      }
    }
    var exceptionLast = 0;
    var uncaughtExceptionCount = 0;
    var ___cxa_throw = (ptr, type, destructor) => {
      var info = new ExceptionInfo(ptr);
      info.init(type, destructor);
      exceptionLast = ptr;
      uncaughtExceptionCount++;
      throw exceptionLast;
    };
    function pthreadCreateProxied(pthread_ptr, attr, startRoutine, arg) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(2, 0, 1, pthread_ptr, attr, startRoutine, arg);
      return ___pthread_create_js(pthread_ptr, attr, startRoutine, arg);
    }
    var ___pthread_create_js = (pthread_ptr, attr, startRoutine, arg) => {
      if (typeof SharedArrayBuffer == "undefined") {
        err(
          "Current environment does not support SharedArrayBuffer, pthreads are not available!"
        );
        return 6;
      }
      var transferList = [];
      var error = 0;
      if (ENVIRONMENT_IS_PTHREAD && (transferList.length === 0 || error)) {
        return pthreadCreateProxied(pthread_ptr, attr, startRoutine, arg);
      }
      if (error) return error;
      var threadParams = { startRoutine, pthread_ptr, arg, transferList };
      if (ENVIRONMENT_IS_PTHREAD) {
        threadParams.cmd = "spawnThread";
        postMessage(threadParams, transferList);
        return 0;
      }
      return spawnThread(threadParams);
    };
    var __abort_js = () => {
      abort("");
    };
    var __embind_register_bigint = (
      primitiveType,
      name,
      size,
      minRange,
      maxRange
    ) => {};
    var embind_init_charCodes = () => {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
        codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    };
    var embind_charCodes;
    var readLatin1String = (ptr) => {
      var ret = "";
      var c = ptr;
      while (HEAPU8[c]) {
        ret += embind_charCodes[HEAPU8[c++]];
      }
      return ret;
    };
    var awaitingDependencies = {};
    var registeredTypes = {};
    var typeDependencies = {};
    var BindingError;
    var throwBindingError = (message) => {
      throw new BindingError(message);
    };
    var InternalError;
    var throwInternalError = (message) => {
      throw new InternalError(message);
    };
    var whenDependentTypesAreResolved = (
      myTypes,
      dependentTypes,
      getTypeConverters
    ) => {
      myTypes.forEach((type) => (typeDependencies[type] = dependentTypes));
      function onComplete(typeConverters) {
        var myTypeConverters = getTypeConverters(typeConverters);
        if (myTypeConverters.length !== myTypes.length) {
          throwInternalError("Mismatched type converter count");
        }
        for (var i = 0; i < myTypes.length; ++i) {
          registerType(myTypes[i], myTypeConverters[i]);
        }
      }
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach((dt, i) => {
        if (registeredTypes.hasOwnProperty(dt)) {
          typeConverters[i] = registeredTypes[dt];
        } else {
          unregisteredTypes.push(dt);
          if (!awaitingDependencies.hasOwnProperty(dt)) {
            awaitingDependencies[dt] = [];
          }
          awaitingDependencies[dt].push(() => {
            typeConverters[i] = registeredTypes[dt];
            ++registered;
            if (registered === unregisteredTypes.length) {
              onComplete(typeConverters);
            }
          });
        }
      });
      if (0 === unregisteredTypes.length) {
        onComplete(typeConverters);
      }
    };
    function sharedRegisterType(rawType, registeredInstance, options = {}) {
      var name = registeredInstance.name;
      if (!rawType) {
        throwBindingError(
          `type "${name}" must have a positive integer typeid pointer`
        );
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
        if (options.ignoreDuplicateRegistrations) {
          return;
        } else {
          throwBindingError(`Cannot register type '${name}' twice`);
        }
      }
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
      if (awaitingDependencies.hasOwnProperty(rawType)) {
        var callbacks = awaitingDependencies[rawType];
        delete awaitingDependencies[rawType];
        callbacks.forEach((cb) => cb());
      }
    }
    function registerType(rawType, registeredInstance, options = {}) {
      return sharedRegisterType(rawType, registeredInstance, options);
    }
    var GenericWireTypeSize = 8;
    var __embind_register_bool = (rawType, name, trueValue, falseValue) => {
      name = readLatin1String(name);
      registerType(rawType, {
        name,
        fromWireType: function (wt) {
          return !!wt;
        },
        toWireType: function (destructors, o) {
          return o ? trueValue : falseValue;
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: function (pointer) {
          return this["fromWireType"](HEAPU8[pointer]);
        },
        destructorFunction: null,
      });
    };
    var shallowCopyInternalPointer = (o) => ({
      count: o.count,
      deleteScheduled: o.deleteScheduled,
      preservePointerOnDelete: o.preservePointerOnDelete,
      ptr: o.ptr,
      ptrType: o.ptrType,
      smartPtr: o.smartPtr,
      smartPtrType: o.smartPtrType,
    });
    var throwInstanceAlreadyDeleted = (obj) => {
      function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
      }
      throwBindingError(getInstanceTypeName(obj) + " instance already deleted");
    };
    var finalizationRegistry = false;
    var detachFinalizer = (handle) => {};
    var runDestructor = ($$) => {
      if ($$.smartPtr) {
        $$.smartPtrType.rawDestructor($$.smartPtr);
      } else {
        $$.ptrType.registeredClass.rawDestructor($$.ptr);
      }
    };
    var releaseClassHandle = ($$) => {
      $$.count.value -= 1;
      var toDelete = 0 === $$.count.value;
      if (toDelete) {
        runDestructor($$);
      }
    };
    var downcastPointer = (ptr, ptrClass, desiredClass) => {
      if (ptrClass === desiredClass) {
        return ptr;
      }
      if (undefined === desiredClass.baseClass) {
        return null;
      }
      var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
      if (rv === null) {
        return null;
      }
      return desiredClass.downcast(rv);
    };
    var registeredPointers = {};
    var getInheritedInstanceCount = () =>
      Object.keys(registeredInstances).length;
    var getLiveInheritedInstances = () => {
      var rv = [];
      for (var k in registeredInstances) {
        if (registeredInstances.hasOwnProperty(k)) {
          rv.push(registeredInstances[k]);
        }
      }
      return rv;
    };
    var deletionQueue = [];
    var flushPendingDeletes = () => {
      while (deletionQueue.length) {
        var obj = deletionQueue.pop();
        obj.$$.deleteScheduled = false;
        obj["delete"]();
      }
    };
    var delayFunction;
    var setDelayFunction = (fn) => {
      delayFunction = fn;
      if (deletionQueue.length && delayFunction) {
        delayFunction(flushPendingDeletes);
      }
    };
    var init_embind = () => {
      Module["getInheritedInstanceCount"] = getInheritedInstanceCount;
      Module["getLiveInheritedInstances"] = getLiveInheritedInstances;
      Module["flushPendingDeletes"] = flushPendingDeletes;
      Module["setDelayFunction"] = setDelayFunction;
    };
    var registeredInstances = {};
    var getBasestPointer = (class_, ptr) => {
      if (ptr === undefined) {
        throwBindingError("ptr should not be undefined");
      }
      while (class_.baseClass) {
        ptr = class_.upcast(ptr);
        class_ = class_.baseClass;
      }
      return ptr;
    };
    var getInheritedInstance = (class_, ptr) => {
      ptr = getBasestPointer(class_, ptr);
      return registeredInstances[ptr];
    };
    var makeClassHandle = (prototype, record) => {
      if (!record.ptrType || !record.ptr) {
        throwInternalError("makeClassHandle requires ptr and ptrType");
      }
      var hasSmartPtrType = !!record.smartPtrType;
      var hasSmartPtr = !!record.smartPtr;
      if (hasSmartPtrType !== hasSmartPtr) {
        throwInternalError("Both smartPtrType and smartPtr must be specified");
      }
      record.count = { value: 1 };
      return attachFinalizer(
        Object.create(prototype, { $$: { value: record, writable: true } })
      );
    };
    function RegisteredPointer_fromWireType(ptr) {
      var rawPointer = this.getPointee(ptr);
      if (!rawPointer) {
        this.destructor(ptr);
        return null;
      }
      var registeredInstance = getInheritedInstance(
        this.registeredClass,
        rawPointer
      );
      if (undefined !== registeredInstance) {
        if (0 === registeredInstance.$$.count.value) {
          registeredInstance.$$.ptr = rawPointer;
          registeredInstance.$$.smartPtr = ptr;
          return registeredInstance["clone"]();
        } else {
          var rv = registeredInstance["clone"]();
          this.destructor(ptr);
          return rv;
        }
      }
      function makeDefaultHandle() {
        if (this.isSmartPointer) {
          return makeClassHandle(this.registeredClass.instancePrototype, {
            ptrType: this.pointeeType,
            ptr: rawPointer,
            smartPtrType: this,
            smartPtr: ptr,
          });
        } else {
          return makeClassHandle(this.registeredClass.instancePrototype, {
            ptrType: this,
            ptr,
          });
        }
      }
      var actualType = this.registeredClass.getActualType(rawPointer);
      var registeredPointerRecord = registeredPointers[actualType];
      if (!registeredPointerRecord) {
        return makeDefaultHandle.call(this);
      }
      var toType;
      if (this.isConst) {
        toType = registeredPointerRecord.constPointerType;
      } else {
        toType = registeredPointerRecord.pointerType;
      }
      var dp = downcastPointer(
        rawPointer,
        this.registeredClass,
        toType.registeredClass
      );
      if (dp === null) {
        return makeDefaultHandle.call(this);
      }
      if (this.isSmartPointer) {
        return makeClassHandle(toType.registeredClass.instancePrototype, {
          ptrType: toType,
          ptr: dp,
          smartPtrType: this,
          smartPtr: ptr,
        });
      } else {
        return makeClassHandle(toType.registeredClass.instancePrototype, {
          ptrType: toType,
          ptr: dp,
        });
      }
    }
    var attachFinalizer = (handle) => {
      if ("undefined" === typeof FinalizationRegistry) {
        attachFinalizer = (handle) => handle;
        return handle;
      }
      finalizationRegistry = new FinalizationRegistry((info) => {
        releaseClassHandle(info.$$);
      });
      attachFinalizer = (handle) => {
        var $$ = handle.$$;
        var hasSmartPtr = !!$$.smartPtr;
        if (hasSmartPtr) {
          var info = { $$ };
          finalizationRegistry.register(handle, info, handle);
        }
        return handle;
      };
      detachFinalizer = (handle) => finalizationRegistry.unregister(handle);
      return attachFinalizer(handle);
    };
    var init_ClassHandle = () => {
      Object.assign(ClassHandle.prototype, {
        isAliasOf(other) {
          if (!(this instanceof ClassHandle)) {
            return false;
          }
          if (!(other instanceof ClassHandle)) {
            return false;
          }
          var leftClass = this.$$.ptrType.registeredClass;
          var left = this.$$.ptr;
          other.$$ = other.$$;
          var rightClass = other.$$.ptrType.registeredClass;
          var right = other.$$.ptr;
          while (leftClass.baseClass) {
            left = leftClass.upcast(left);
            leftClass = leftClass.baseClass;
          }
          while (rightClass.baseClass) {
            right = rightClass.upcast(right);
            rightClass = rightClass.baseClass;
          }
          return leftClass === rightClass && left === right;
        },
        clone() {
          if (!this.$$.ptr) {
            throwInstanceAlreadyDeleted(this);
          }
          if (this.$$.preservePointerOnDelete) {
            this.$$.count.value += 1;
            return this;
          } else {
            var clone = attachFinalizer(
              Object.create(Object.getPrototypeOf(this), {
                $$: { value: shallowCopyInternalPointer(this.$$) },
              })
            );
            clone.$$.count.value += 1;
            clone.$$.deleteScheduled = false;
            return clone;
          }
        },
        delete() {
          if (!this.$$.ptr) {
            throwInstanceAlreadyDeleted(this);
          }
          if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
            throwBindingError("Object already scheduled for deletion");
          }
          detachFinalizer(this);
          releaseClassHandle(this.$$);
          if (!this.$$.preservePointerOnDelete) {
            this.$$.smartPtr = undefined;
            this.$$.ptr = undefined;
          }
        },
        isDeleted() {
          return !this.$$.ptr;
        },
        deleteLater() {
          if (!this.$$.ptr) {
            throwInstanceAlreadyDeleted(this);
          }
          if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
            throwBindingError("Object already scheduled for deletion");
          }
          deletionQueue.push(this);
          if (deletionQueue.length === 1 && delayFunction) {
            delayFunction(flushPendingDeletes);
          }
          this.$$.deleteScheduled = true;
          return this;
        },
      });
    };
    function ClassHandle() {}
    var createNamedFunction = (name, body) =>
      Object.defineProperty(body, "name", { value: name });
    var ensureOverloadTable = (proto, methodName, humanName) => {
      if (undefined === proto[methodName].overloadTable) {
        var prevFunc = proto[methodName];
        proto[methodName] = function (...args) {
          if (!proto[methodName].overloadTable.hasOwnProperty(args.length)) {
            throwBindingError(
              `Function '${humanName}' called with an invalid number of arguments (${args.length}) - expects one of (${proto[methodName].overloadTable})!`
            );
          }
          return proto[methodName].overloadTable[args.length].apply(this, args);
        };
        proto[methodName].overloadTable = [];
        proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    };
    var exposePublicSymbol = (name, value, numArguments) => {
      if (Module.hasOwnProperty(name)) {
        if (
          undefined === numArguments ||
          (undefined !== Module[name].overloadTable &&
            undefined !== Module[name].overloadTable[numArguments])
        ) {
          throwBindingError(`Cannot register public name '${name}' twice`);
        }
        ensureOverloadTable(Module, name, name);
        if (Module.hasOwnProperty(numArguments)) {
          throwBindingError(
            `Cannot register multiple overloads of a function with the same number of arguments (${numArguments})!`
          );
        }
        Module[name].overloadTable[numArguments] = value;
      } else {
        Module[name] = value;
        if (undefined !== numArguments) {
          Module[name].numArguments = numArguments;
        }
      }
    };
    var char_0 = 48;
    var char_9 = 57;
    var makeLegalFunctionName = (name) => {
      if (undefined === name) {
        return "_unknown";
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, "$");
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
        return `_${name}`;
      }
      return name;
    };
    function RegisteredClass(
      name,
      constructor,
      instancePrototype,
      rawDestructor,
      baseClass,
      getActualType,
      upcast,
      downcast
    ) {
      this.name = name;
      this.constructor = constructor;
      this.instancePrototype = instancePrototype;
      this.rawDestructor = rawDestructor;
      this.baseClass = baseClass;
      this.getActualType = getActualType;
      this.upcast = upcast;
      this.downcast = downcast;
      this.pureVirtualFunctions = [];
    }
    var upcastPointer = (ptr, ptrClass, desiredClass) => {
      while (ptrClass !== desiredClass) {
        if (!ptrClass.upcast) {
          throwBindingError(
            `Expected null or instance of ${desiredClass.name}, got an instance of ${ptrClass.name}`
          );
        }
        ptr = ptrClass.upcast(ptr);
        ptrClass = ptrClass.baseClass;
      }
      return ptr;
    };
    function constNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
        if (this.isReference) {
          throwBindingError(`null is not a valid ${this.name}`);
        }
        return 0;
      }
      if (!handle.$$) {
        throwBindingError(
          `Cannot pass "${embindRepr(handle)}" as a ${this.name}`
        );
      }
      if (!handle.$$.ptr) {
        throwBindingError(
          `Cannot pass deleted object as a pointer of type ${this.name}`
        );
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
    function genericPointerToWireType(destructors, handle) {
      var ptr;
      if (handle === null) {
        if (this.isReference) {
          throwBindingError(`null is not a valid ${this.name}`);
        }
        if (this.isSmartPointer) {
          ptr = this.rawConstructor();
          if (destructors !== null) {
            destructors.push(this.rawDestructor, ptr);
          }
          return ptr;
        } else {
          return 0;
        }
      }
      if (!handle || !handle.$$) {
        throwBindingError(
          `Cannot pass "${embindRepr(handle)}" as a ${this.name}`
        );
      }
      if (!handle.$$.ptr) {
        throwBindingError(
          `Cannot pass deleted object as a pointer of type ${this.name}`
        );
      }
      if (!this.isConst && handle.$$.ptrType.isConst) {
        throwBindingError(
          `Cannot convert argument of type ${
            handle.$$.smartPtrType
              ? handle.$$.smartPtrType.name
              : handle.$$.ptrType.name
          } to parameter type ${this.name}`
        );
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      if (this.isSmartPointer) {
        if (undefined === handle.$$.smartPtr) {
          throwBindingError("Passing raw pointer to smart pointer is illegal");
        }
        switch (this.sharingPolicy) {
          case 0:
            if (handle.$$.smartPtrType === this) {
              ptr = handle.$$.smartPtr;
            } else {
              throwBindingError(
                `Cannot convert argument of type ${
                  handle.$$.smartPtrType
                    ? handle.$$.smartPtrType.name
                    : handle.$$.ptrType.name
                } to parameter type ${this.name}`
              );
            }
            break;
          case 1:
            ptr = handle.$$.smartPtr;
            break;
          case 2:
            if (handle.$$.smartPtrType === this) {
              ptr = handle.$$.smartPtr;
            } else {
              var clonedHandle = handle["clone"]();
              ptr = this.rawShare(
                ptr,
                Emval.toHandle(() => clonedHandle["delete"]())
              );
              if (destructors !== null) {
                destructors.push(this.rawDestructor, ptr);
              }
            }
            break;
          default:
            throwBindingError("Unsupporting sharing policy");
        }
      }
      return ptr;
    }
    function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
        if (this.isReference) {
          throwBindingError(`null is not a valid ${this.name}`);
        }
        return 0;
      }
      if (!handle.$$) {
        throwBindingError(
          `Cannot pass "${embindRepr(handle)}" as a ${this.name}`
        );
      }
      if (!handle.$$.ptr) {
        throwBindingError(
          `Cannot pass deleted object as a pointer of type ${this.name}`
        );
      }
      if (handle.$$.ptrType.isConst) {
        throwBindingError(
          `Cannot convert argument of type ${handle.$$.ptrType.name} to parameter type ${this.name}`
        );
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
    function readPointer(pointer) {
      return this["fromWireType"](HEAPU32[pointer >> 2]);
    }
    var init_RegisteredPointer = () => {
      Object.assign(RegisteredPointer.prototype, {
        getPointee(ptr) {
          if (this.rawGetPointee) {
            ptr = this.rawGetPointee(ptr);
          }
          return ptr;
        },
        destructor(ptr) {
          this.rawDestructor?.(ptr);
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: readPointer,
        fromWireType: RegisteredPointer_fromWireType,
      });
    };
    function RegisteredPointer(
      name,
      registeredClass,
      isReference,
      isConst,
      isSmartPointer,
      pointeeType,
      sharingPolicy,
      rawGetPointee,
      rawConstructor,
      rawShare,
      rawDestructor
    ) {
      this.name = name;
      this.registeredClass = registeredClass;
      this.isReference = isReference;
      this.isConst = isConst;
      this.isSmartPointer = isSmartPointer;
      this.pointeeType = pointeeType;
      this.sharingPolicy = sharingPolicy;
      this.rawGetPointee = rawGetPointee;
      this.rawConstructor = rawConstructor;
      this.rawShare = rawShare;
      this.rawDestructor = rawDestructor;
      if (!isSmartPointer && registeredClass.baseClass === undefined) {
        if (isConst) {
          this["toWireType"] = constNoSmartPtrRawPointerToWireType;
          this.destructorFunction = null;
        } else {
          this["toWireType"] = nonConstNoSmartPtrRawPointerToWireType;
          this.destructorFunction = null;
        }
      } else {
        this["toWireType"] = genericPointerToWireType;
      }
    }
    var replacePublicSymbol = (name, value, numArguments) => {
      if (!Module.hasOwnProperty(name)) {
        throwInternalError("Replacing nonexistent public symbol");
      }
      if (
        undefined !== Module[name].overloadTable &&
        undefined !== numArguments
      ) {
        Module[name].overloadTable[numArguments] = value;
      } else {
        Module[name] = value;
        Module[name].argCount = numArguments;
      }
    };
    var dynCallLegacy = (sig, ptr, args) => {
      sig = sig.replace(/p/g, "i");
      var f = Module["dynCall_" + sig];
      return f(ptr, ...args);
    };
    var dynCall = (sig, ptr, args = []) => {
      if (sig.includes("j")) {
        return dynCallLegacy(sig, ptr, args);
      }
      var rtn = getWasmTableEntry(ptr)(...args);
      return rtn;
    };
    var getDynCaller =
      (sig, ptr) =>
      (...args) =>
        dynCall(sig, ptr, args);
    var embind__requireFunction = (signature, rawFunction) => {
      signature = readLatin1String(signature);
      function makeDynCaller() {
        if (signature.includes("j")) {
          return getDynCaller(signature, rawFunction);
        }
        return getWasmTableEntry(rawFunction);
      }
      var fp = makeDynCaller();
      if (typeof fp != "function") {
        throwBindingError(
          `unknown function pointer with signature ${signature}: ${rawFunction}`
        );
      }
      return fp;
    };
    var extendError = (baseErrorType, errorName) => {
      var errorClass = createNamedFunction(errorName, function (message) {
        this.name = errorName;
        this.message = message;
        var stack = new Error(message).stack;
        if (stack !== undefined) {
          this.stack =
            this.toString() + "\n" + stack.replace(/^Error(:[^\n]*)?\n/, "");
        }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function () {
        if (this.message === undefined) {
          return this.name;
        } else {
          return `${this.name}: ${this.message}`;
        }
      };
      return errorClass;
    };
    var UnboundTypeError;
    var getTypeName = (type) => {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    };
    var throwUnboundTypeError = (message, types) => {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
        if (seen[type]) {
          return;
        }
        if (registeredTypes[type]) {
          return;
        }
        if (typeDependencies[type]) {
          typeDependencies[type].forEach(visit);
          return;
        }
        unboundTypes.push(type);
        seen[type] = true;
      }
      types.forEach(visit);
      throw new UnboundTypeError(
        `${message}: ` + unboundTypes.map(getTypeName).join([", "])
      );
    };
    var __embind_register_class = (
      rawType,
      rawPointerType,
      rawConstPointerType,
      baseClassRawType,
      getActualTypeSignature,
      getActualType,
      upcastSignature,
      upcast,
      downcastSignature,
      downcast,
      name,
      destructorSignature,
      rawDestructor
    ) => {
      name = readLatin1String(name);
      getActualType = embind__requireFunction(
        getActualTypeSignature,
        getActualType
      );
      upcast &&= embind__requireFunction(upcastSignature, upcast);
      downcast &&= embind__requireFunction(downcastSignature, downcast);
      rawDestructor = embind__requireFunction(
        destructorSignature,
        rawDestructor
      );
      var legalFunctionName = makeLegalFunctionName(name);
      exposePublicSymbol(legalFunctionName, function () {
        throwUnboundTypeError(`Cannot construct ${name} due to unbound types`, [
          baseClassRawType,
        ]);
      });
      whenDependentTypesAreResolved(
        [rawType, rawPointerType, rawConstPointerType],
        baseClassRawType ? [baseClassRawType] : [],
        (base) => {
          base = base[0];
          var baseClass;
          var basePrototype;
          if (baseClassRawType) {
            baseClass = base.registeredClass;
            basePrototype = baseClass.instancePrototype;
          } else {
            basePrototype = ClassHandle.prototype;
          }
          var constructor = createNamedFunction(name, function (...args) {
            if (Object.getPrototypeOf(this) !== instancePrototype) {
              throw new BindingError("Use 'new' to construct " + name);
            }
            if (undefined === registeredClass.constructor_body) {
              throw new BindingError(name + " has no accessible constructor");
            }
            var body = registeredClass.constructor_body[args.length];
            if (undefined === body) {
              throw new BindingError(
                `Tried to invoke ctor of ${name} with invalid number of parameters (${
                  args.length
                }) - expected (${Object.keys(
                  registeredClass.constructor_body
                ).toString()}) parameters instead!`
              );
            }
            return body.apply(this, args);
          });
          var instancePrototype = Object.create(basePrototype, {
            constructor: { value: constructor },
          });
          constructor.prototype = instancePrototype;
          var registeredClass = new RegisteredClass(
            name,
            constructor,
            instancePrototype,
            rawDestructor,
            baseClass,
            getActualType,
            upcast,
            downcast
          );
          if (registeredClass.baseClass) {
            registeredClass.baseClass.__derivedClasses ??= [];
            registeredClass.baseClass.__derivedClasses.push(registeredClass);
          }
          var referenceConverter = new RegisteredPointer(
            name,
            registeredClass,
            true,
            false,
            false
          );
          var pointerConverter = new RegisteredPointer(
            name + "*",
            registeredClass,
            false,
            false,
            false
          );
          var constPointerConverter = new RegisteredPointer(
            name + " const*",
            registeredClass,
            false,
            true,
            false
          );
          registeredPointers[rawType] = {
            pointerType: pointerConverter,
            constPointerType: constPointerConverter,
          };
          replacePublicSymbol(legalFunctionName, constructor);
          return [referenceConverter, pointerConverter, constPointerConverter];
        }
      );
    };
    var heap32VectorToArray = (count, firstElement) => {
      var array = [];
      for (var i = 0; i < count; i++) {
        array.push(HEAPU32[(firstElement + i * 4) >> 2]);
      }
      return array;
    };
    var runDestructors = (destructors) => {
      while (destructors.length) {
        var ptr = destructors.pop();
        var del = destructors.pop();
        del(ptr);
      }
    };
    function usesDestructorStack(argTypes) {
      for (var i = 1; i < argTypes.length; ++i) {
        if (
          argTypes[i] !== null &&
          argTypes[i].destructorFunction === undefined
        ) {
          return true;
        }
      }
      return false;
    }
    function newFunc(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
        throw new TypeError(
          `new_ called with constructor type ${typeof constructor} which is not a function`
        );
      }
      var dummy = createNamedFunction(
        constructor.name || "unknownFunctionName",
        function () {}
      );
      dummy.prototype = constructor.prototype;
      var obj = new dummy();
      var r = constructor.apply(obj, argumentList);
      return r instanceof Object ? r : obj;
    }
    function createJsInvoker(argTypes, isClassMethodFunc, returns, isAsync) {
      var needsDestructorStack = usesDestructorStack(argTypes);
      var argCount = argTypes.length - 2;
      var argsList = [];
      var argsListWired = ["fn"];
      if (isClassMethodFunc) {
        argsListWired.push("thisWired");
      }
      for (var i = 0; i < argCount; ++i) {
        argsList.push(`arg${i}`);
        argsListWired.push(`arg${i}Wired`);
      }
      argsList = argsList.join(",");
      argsListWired = argsListWired.join(",");
      var invokerFnBody = `return function (${argsList}) {\n`;
      if (needsDestructorStack) {
        invokerFnBody += "var destructors = [];\n";
      }
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = [
        "humanName",
        "throwBindingError",
        "invoker",
        "fn",
        "runDestructors",
        "retType",
        "classParam",
      ];
      if (isClassMethodFunc) {
        invokerFnBody += `var thisWired = classParam['toWireType'](${dtorStack}, this);\n`;
      }
      for (var i = 0; i < argCount; ++i) {
        invokerFnBody += `var arg${i}Wired = argType${i}['toWireType'](${dtorStack}, arg${i});\n`;
        args1.push(`argType${i}`);
      }
      invokerFnBody +=
        (returns || isAsync ? "var rv = " : "") +
        `invoker(${argsListWired});\n`;
      if (needsDestructorStack) {
        invokerFnBody += "runDestructors(destructors);\n";
      } else {
        for (var i = isClassMethodFunc ? 1 : 2; i < argTypes.length; ++i) {
          var paramName = i === 1 ? "thisWired" : "arg" + (i - 2) + "Wired";
          if (argTypes[i].destructorFunction !== null) {
            invokerFnBody += `${paramName}_dtor(${paramName});\n`;
            args1.push(`${paramName}_dtor`);
          }
        }
      }
      if (returns) {
        invokerFnBody +=
          "var ret = retType['fromWireType'](rv);\n" + "return ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
      return [args1, invokerFnBody];
    }
    function craftInvokerFunction(
      humanName,
      argTypes,
      classType,
      cppInvokerFunc,
      cppTargetFunc,
      isAsync
    ) {
      var argCount = argTypes.length;
      if (argCount < 2) {
        throwBindingError(
          "argTypes array size mismatch! Must at least get return value and 'this' types!"
        );
      }
      var isClassMethodFunc = argTypes[1] !== null && classType !== null;
      var needsDestructorStack = usesDestructorStack(argTypes);
      var returns = argTypes[0].name !== "void";
      var closureArgs = [
        humanName,
        throwBindingError,
        cppInvokerFunc,
        cppTargetFunc,
        runDestructors,
        argTypes[0],
        argTypes[1],
      ];
      for (var i = 0; i < argCount - 2; ++i) {
        closureArgs.push(argTypes[i + 2]);
      }
      if (!needsDestructorStack) {
        for (var i = isClassMethodFunc ? 1 : 2; i < argTypes.length; ++i) {
          if (argTypes[i].destructorFunction !== null) {
            closureArgs.push(argTypes[i].destructorFunction);
          }
        }
      }
      let [args, invokerFnBody] = createJsInvoker(
        argTypes,
        isClassMethodFunc,
        returns,
        isAsync
      );
      args.push(invokerFnBody);
      var invokerFn = newFunc(Function, args)(...closureArgs);
      return createNamedFunction(humanName, invokerFn);
    }
    var __embind_register_class_constructor = (
      rawClassType,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      invoker,
      rawConstructor
    ) => {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      invoker = embind__requireFunction(invokerSignature, invoker);
      whenDependentTypesAreResolved([], [rawClassType], (classType) => {
        classType = classType[0];
        var humanName = `constructor ${classType.name}`;
        if (undefined === classType.registeredClass.constructor_body) {
          classType.registeredClass.constructor_body = [];
        }
        if (
          undefined !== classType.registeredClass.constructor_body[argCount - 1]
        ) {
          throw new BindingError(
            `Cannot register multiple constructors with identical number of parameters (${
              argCount - 1
            }) for class '${
              classType.name
            }'! Overload resolution is currently only performed using the parameter count, not actual type info!`
          );
        }
        classType.registeredClass.constructor_body[argCount - 1] = () => {
          throwUnboundTypeError(
            `Cannot construct ${classType.name} due to unbound types`,
            rawArgTypes
          );
        };
        whenDependentTypesAreResolved([], rawArgTypes, (argTypes) => {
          argTypes.splice(1, 0, null);
          classType.registeredClass.constructor_body[argCount - 1] =
            craftInvokerFunction(
              humanName,
              argTypes,
              null,
              invoker,
              rawConstructor
            );
          return [];
        });
        return [];
      });
    };
    var getFunctionName = (signature) => {
      signature = signature.trim();
      const argsIndex = signature.indexOf("(");
      if (argsIndex !== -1) {
        return signature.substr(0, argsIndex);
      } else {
        return signature;
      }
    };
    var __embind_register_class_function = (
      rawClassType,
      methodName,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      rawInvoker,
      context,
      isPureVirtual,
      isAsync,
      isNonnullReturn
    ) => {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      methodName = getFunctionName(methodName);
      rawInvoker = embind__requireFunction(invokerSignature, rawInvoker);
      whenDependentTypesAreResolved([], [rawClassType], (classType) => {
        classType = classType[0];
        var humanName = `${classType.name}.${methodName}`;
        if (methodName.startsWith("@@")) {
          methodName = Symbol[methodName.substring(2)];
        }
        if (isPureVirtual) {
          classType.registeredClass.pureVirtualFunctions.push(methodName);
        }
        function unboundTypesHandler() {
          throwUnboundTypeError(
            `Cannot call ${humanName} due to unbound types`,
            rawArgTypes
          );
        }
        var proto = classType.registeredClass.instancePrototype;
        var method = proto[methodName];
        if (
          undefined === method ||
          (undefined === method.overloadTable &&
            method.className !== classType.name &&
            method.argCount === argCount - 2)
        ) {
          unboundTypesHandler.argCount = argCount - 2;
          unboundTypesHandler.className = classType.name;
          proto[methodName] = unboundTypesHandler;
        } else {
          ensureOverloadTable(proto, methodName, humanName);
          proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
        }
        whenDependentTypesAreResolved([], rawArgTypes, (argTypes) => {
          var memberFunction = craftInvokerFunction(
            humanName,
            argTypes,
            classType,
            rawInvoker,
            context,
            isAsync
          );
          if (undefined === proto[methodName].overloadTable) {
            memberFunction.argCount = argCount - 2;
            proto[methodName] = memberFunction;
          } else {
            proto[methodName].overloadTable[argCount - 2] = memberFunction;
          }
          return [];
        });
        return [];
      });
    };
    var emval_freelist = [];
    var emval_handles = [];
    var __emval_decref = (handle) => {
      if (handle > 9 && 0 === --emval_handles[handle + 1]) {
        emval_handles[handle] = undefined;
        emval_freelist.push(handle);
      }
    };
    var count_emval_handles = () =>
      emval_handles.length / 2 - 5 - emval_freelist.length;
    var init_emval = () => {
      emval_handles.push(0, 1, undefined, 1, null, 1, true, 1, false, 1);
      Module["count_emval_handles"] = count_emval_handles;
    };
    var Emval = {
      toValue: (handle) => {
        if (!handle) {
          throwBindingError("Cannot use deleted val. handle = " + handle);
        }
        return emval_handles[handle];
      },
      toHandle: (value) => {
        switch (value) {
          case undefined:
            return 2;
          case null:
            return 4;
          case true:
            return 6;
          case false:
            return 8;
          default: {
            const handle = emval_freelist.pop() || emval_handles.length;
            emval_handles[handle] = value;
            emval_handles[handle + 1] = 1;
            return handle;
          }
        }
      },
    };
    var EmValType = {
      name: "emscripten::val",
      fromWireType: (handle) => {
        var rv = Emval.toValue(handle);
        __emval_decref(handle);
        return rv;
      },
      toWireType: (destructors, value) => Emval.toHandle(value),
      argPackAdvance: GenericWireTypeSize,
      readValueFromPointer: readPointer,
      destructorFunction: null,
    };
    var __embind_register_emval = (rawType) => registerType(rawType, EmValType);
    var embindRepr = (v) => {
      if (v === null) {
        return "null";
      }
      var t = typeof v;
      if (t === "object" || t === "array" || t === "function") {
        return v.toString();
      } else {
        return "" + v;
      }
    };
    var floatReadValueFromPointer = (name, width) => {
      switch (width) {
        case 4:
          return function (pointer) {
            return this["fromWireType"](HEAPF32[pointer >> 2]);
          };
        case 8:
          return function (pointer) {
            return this["fromWireType"](HEAPF64[pointer >> 3]);
          };
        default:
          throw new TypeError(`invalid float width (${width}): ${name}`);
      }
    };
    var __embind_register_float = (rawType, name, size) => {
      name = readLatin1String(name);
      registerType(rawType, {
        name,
        fromWireType: (value) => value,
        toWireType: (destructors, value) => value,
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: floatReadValueFromPointer(name, size),
        destructorFunction: null,
      });
    };
    var integerReadValueFromPointer = (name, width, signed) => {
      switch (width) {
        case 1:
          return signed
            ? (pointer) => HEAP8[pointer]
            : (pointer) => HEAPU8[pointer];
        case 2:
          return signed
            ? (pointer) => HEAP16[pointer >> 1]
            : (pointer) => HEAPU16[pointer >> 1];
        case 4:
          return signed
            ? (pointer) => HEAP32[pointer >> 2]
            : (pointer) => HEAPU32[pointer >> 2];
        default:
          throw new TypeError(`invalid integer width (${width}): ${name}`);
      }
    };
    var __embind_register_integer = (
      primitiveType,
      name,
      size,
      minRange,
      maxRange
    ) => {
      name = readLatin1String(name);
      if (maxRange === -1) {
        maxRange = 4294967295;
      }
      var fromWireType = (value) => value;
      if (minRange === 0) {
        var bitshift = 32 - 8 * size;
        fromWireType = (value) => (value << bitshift) >>> bitshift;
      }
      var isUnsignedType = name.includes("unsigned");
      var checkAssertions = (value, toTypeName) => {};
      var toWireType;
      if (isUnsignedType) {
        toWireType = function (destructors, value) {
          checkAssertions(value, this.name);
          return value >>> 0;
        };
      } else {
        toWireType = function (destructors, value) {
          checkAssertions(value, this.name);
          return value;
        };
      }
      registerType(primitiveType, {
        name,
        fromWireType,
        toWireType,
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: integerReadValueFromPointer(
          name,
          size,
          minRange !== 0
        ),
        destructorFunction: null,
      });
    };
    var __embind_register_memory_view = (rawType, dataTypeIndex, name) => {
      var typeMapping = [
        Int8Array,
        Uint8Array,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
      ];
      var TA = typeMapping[dataTypeIndex];
      function decodeMemoryView(handle) {
        var size = HEAPU32[handle >> 2];
        var data = HEAPU32[(handle + 4) >> 2];
        return new TA(HEAP8.buffer, data, size);
      }
      name = readLatin1String(name);
      registerType(
        rawType,
        {
          name,
          fromWireType: decodeMemoryView,
          argPackAdvance: GenericWireTypeSize,
          readValueFromPointer: decodeMemoryView,
        },
        { ignoreDuplicateRegistrations: true }
      );
    };
    var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      if (!(maxBytesToWrite > 0)) return 0;
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1;
      for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) {
          var u1 = str.charCodeAt(++i);
          u = (65536 + ((u & 1023) << 10)) | (u1 & 1023);
        }
        if (u <= 127) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 2047) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 192 | (u >> 6);
          heap[outIdx++] = 128 | (u & 63);
        } else if (u <= 65535) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 224 | (u >> 12);
          heap[outIdx++] = 128 | ((u >> 6) & 63);
          heap[outIdx++] = 128 | (u & 63);
        } else {
          if (outIdx + 3 >= endIdx) break;
          heap[outIdx++] = 240 | (u >> 18);
          heap[outIdx++] = 128 | ((u >> 12) & 63);
          heap[outIdx++] = 128 | ((u >> 6) & 63);
          heap[outIdx++] = 128 | (u & 63);
        }
      }
      heap[outIdx] = 0;
      return outIdx - startIdx;
    };
    var stringToUTF8 = (str, outPtr, maxBytesToWrite) =>
      stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var c = str.charCodeAt(i);
        if (c <= 127) {
          len++;
        } else if (c <= 2047) {
          len += 2;
        } else if (c >= 55296 && c <= 57343) {
          len += 4;
          ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
    var UTF8Decoder =
      typeof TextDecoder != "undefined" ? new TextDecoder() : undefined;
    var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(
          heapOrArray.buffer instanceof SharedArrayBuffer
            ? heapOrArray.slice(idx, endPtr)
            : heapOrArray.subarray(idx, endPtr)
        );
      }
      var str = "";
      while (idx < endPtr) {
        var u0 = heapOrArray[idx++];
        if (!(u0 & 128)) {
          str += String.fromCharCode(u0);
          continue;
        }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 224) == 192) {
          str += String.fromCharCode(((u0 & 31) << 6) | u1);
          continue;
        }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 240) == 224) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          u0 =
            ((u0 & 7) << 18) |
            (u1 << 12) |
            (u2 << 6) |
            (heapOrArray[idx++] & 63);
        }
        if (u0 < 65536) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 65536;
          str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
        }
      }
      return str;
    };
    var UTF8ToString = (ptr, maxBytesToRead) =>
      ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
    var __embind_register_std_string = (rawType, name) => {
      name = readLatin1String(name);
      var stdStringIsUTF8 = name === "std::string";
      registerType(rawType, {
        name,
        fromWireType(value) {
          var length = HEAPU32[value >> 2];
          var payload = value + 4;
          var str;
          if (stdStringIsUTF8) {
            var decodeStartPtr = payload;
            for (var i = 0; i <= length; ++i) {
              var currentBytePtr = payload + i;
              if (i == length || HEAPU8[currentBytePtr] == 0) {
                var maxRead = currentBytePtr - decodeStartPtr;
                var stringSegment = UTF8ToString(decodeStartPtr, maxRead);
                if (str === undefined) {
                  str = stringSegment;
                } else {
                  str += String.fromCharCode(0);
                  str += stringSegment;
                }
                decodeStartPtr = currentBytePtr + 1;
              }
            }
          } else {
            var a = new Array(length);
            for (var i = 0; i < length; ++i) {
              a[i] = String.fromCharCode(HEAPU8[payload + i]);
            }
            str = a.join("");
          }
          _free(value);
          return str;
        },
        toWireType(destructors, value) {
          if (value instanceof ArrayBuffer) {
            value = new Uint8Array(value);
          }
          var length;
          var valueIsOfTypeString = typeof value == "string";
          if (
            !(
              valueIsOfTypeString ||
              value instanceof Uint8Array ||
              value instanceof Uint8ClampedArray ||
              value instanceof Int8Array
            )
          ) {
            throwBindingError("Cannot pass non-string to std::string");
          }
          if (stdStringIsUTF8 && valueIsOfTypeString) {
            length = lengthBytesUTF8(value);
          } else {
            length = value.length;
          }
          var base = _malloc(4 + length + 1);
          var ptr = base + 4;
          HEAPU32[base >> 2] = length;
          if (stdStringIsUTF8 && valueIsOfTypeString) {
            stringToUTF8(value, ptr, length + 1);
          } else {
            if (valueIsOfTypeString) {
              for (var i = 0; i < length; ++i) {
                var charCode = value.charCodeAt(i);
                if (charCode > 255) {
                  _free(ptr);
                  throwBindingError(
                    "String has UTF-16 code units that do not fit in 8 bits"
                  );
                }
                HEAPU8[ptr + i] = charCode;
              }
            } else {
              for (var i = 0; i < length; ++i) {
                HEAPU8[ptr + i] = value[i];
              }
            }
          }
          if (destructors !== null) {
            destructors.push(_free, base);
          }
          return base;
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: readPointer,
        destructorFunction(ptr) {
          _free(ptr);
        },
      });
    };
    var UTF16Decoder =
      typeof TextDecoder != "undefined"
        ? new TextDecoder("utf-16le")
        : undefined;
    var UTF16ToString = (ptr, maxBytesToRead) => {
      var endPtr = ptr;
      var idx = endPtr >> 1;
      var maxIdx = idx + maxBytesToRead / 2;
      while (!(idx >= maxIdx) && HEAPU16[idx]) ++idx;
      endPtr = idx << 1;
      if (endPtr - ptr > 32 && UTF16Decoder)
        return UTF16Decoder.decode(HEAPU8.slice(ptr, endPtr));
      var str = "";
      for (var i = 0; !(i >= maxBytesToRead / 2); ++i) {
        var codeUnit = HEAP16[(ptr + i * 2) >> 1];
        if (codeUnit == 0) break;
        str += String.fromCharCode(codeUnit);
      }
      return str;
    };
    var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
      maxBytesToWrite ??= 2147483647;
      if (maxBytesToWrite < 2) return 0;
      maxBytesToWrite -= 2;
      var startPtr = outPtr;
      var numCharsToWrite =
        maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
      for (var i = 0; i < numCharsToWrite; ++i) {
        var codeUnit = str.charCodeAt(i);
        HEAP16[outPtr >> 1] = codeUnit;
        outPtr += 2;
      }
      HEAP16[outPtr >> 1] = 0;
      return outPtr - startPtr;
    };
    var lengthBytesUTF16 = (str) => str.length * 2;
    var UTF32ToString = (ptr, maxBytesToRead) => {
      var i = 0;
      var str = "";
      while (!(i >= maxBytesToRead / 4)) {
        var utf32 = HEAP32[(ptr + i * 4) >> 2];
        if (utf32 == 0) break;
        ++i;
        if (utf32 >= 65536) {
          var ch = utf32 - 65536;
          str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
        } else {
          str += String.fromCharCode(utf32);
        }
      }
      return str;
    };
    var stringToUTF32 = (str, outPtr, maxBytesToWrite) => {
      maxBytesToWrite ??= 2147483647;
      if (maxBytesToWrite < 4) return 0;
      var startPtr = outPtr;
      var endPtr = startPtr + maxBytesToWrite - 4;
      for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i);
        if (codeUnit >= 55296 && codeUnit <= 57343) {
          var trailSurrogate = str.charCodeAt(++i);
          codeUnit =
            (65536 + ((codeUnit & 1023) << 10)) | (trailSurrogate & 1023);
        }
        HEAP32[outPtr >> 2] = codeUnit;
        outPtr += 4;
        if (outPtr + 4 > endPtr) break;
      }
      HEAP32[outPtr >> 2] = 0;
      return outPtr - startPtr;
    };
    var lengthBytesUTF32 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        var codeUnit = str.charCodeAt(i);
        if (codeUnit >= 55296 && codeUnit <= 57343) ++i;
        len += 4;
      }
      return len;
    };
    var __embind_register_std_wstring = (rawType, charSize, name) => {
      name = readLatin1String(name);
      var decodeString, encodeString, readCharAt, lengthBytesUTF;
      if (charSize === 2) {
        decodeString = UTF16ToString;
        encodeString = stringToUTF16;
        lengthBytesUTF = lengthBytesUTF16;
        readCharAt = (pointer) => HEAPU16[pointer >> 1];
      } else if (charSize === 4) {
        decodeString = UTF32ToString;
        encodeString = stringToUTF32;
        lengthBytesUTF = lengthBytesUTF32;
        readCharAt = (pointer) => HEAPU32[pointer >> 2];
      }
      registerType(rawType, {
        name,
        fromWireType: (value) => {
          var length = HEAPU32[value >> 2];
          var str;
          var decodeStartPtr = value + 4;
          for (var i = 0; i <= length; ++i) {
            var currentBytePtr = value + 4 + i * charSize;
            if (i == length || readCharAt(currentBytePtr) == 0) {
              var maxReadBytes = currentBytePtr - decodeStartPtr;
              var stringSegment = decodeString(decodeStartPtr, maxReadBytes);
              if (str === undefined) {
                str = stringSegment;
              } else {
                str += String.fromCharCode(0);
                str += stringSegment;
              }
              decodeStartPtr = currentBytePtr + charSize;
            }
          }
          _free(value);
          return str;
        },
        toWireType: (destructors, value) => {
          if (!(typeof value == "string")) {
            throwBindingError(
              `Cannot pass non-string to C++ string type ${name}`
            );
          }
          var length = lengthBytesUTF(value);
          var ptr = _malloc(4 + length + charSize);
          HEAPU32[ptr >> 2] = length / charSize;
          encodeString(value, ptr + 4, length + charSize);
          if (destructors !== null) {
            destructors.push(_free, ptr);
          }
          return ptr;
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: readPointer,
        destructorFunction(ptr) {
          _free(ptr);
        },
      });
    };
    var __embind_register_void = (rawType, name) => {
      name = readLatin1String(name);
      registerType(rawType, {
        isVoid: true,
        name,
        argPackAdvance: 0,
        fromWireType: () => undefined,
        toWireType: (destructors, o) => undefined,
      });
    };
    var __emscripten_init_main_thread_js = (tb) => {
      __emscripten_thread_init(
        tb,
        !ENVIRONMENT_IS_WORKER,
        1,
        !ENVIRONMENT_IS_WEB,
        65536,
        false
      );
      PThread.threadInitTLS();
    };
    var maybeExit = () => {
      if (!keepRuntimeAlive()) {
        try {
          if (ENVIRONMENT_IS_PTHREAD) __emscripten_thread_exit(EXITSTATUS);
          else _exit(EXITSTATUS);
        } catch (e) {
          handleException(e);
        }
      }
    };
    var callUserCallback = (func) => {
      if (ABORT) {
        return;
      }
      try {
        func();
        maybeExit();
      } catch (e) {
        handleException(e);
      }
    };
    var __emscripten_thread_mailbox_await = (pthread_ptr) => {
      if (typeof Atomics.waitAsync === "function") {
        var wait = Atomics.waitAsync(HEAP32, pthread_ptr >> 2, pthread_ptr);
        wait.value.then(checkMailbox);
        var waitingAsync = pthread_ptr + 128;
        Atomics.store(HEAP32, waitingAsync >> 2, 1);
      }
    };
    var checkMailbox = () => {
      var pthread_ptr = _pthread_self();
      if (pthread_ptr) {
        __emscripten_thread_mailbox_await(pthread_ptr);
        callUserCallback(__emscripten_check_mailbox);
      }
    };
    var __emscripten_notify_mailbox_postmessage = (
      targetThread,
      currThreadId
    ) => {
      if (targetThread == currThreadId) {
        setTimeout(checkMailbox);
      } else if (ENVIRONMENT_IS_PTHREAD) {
        postMessage({ targetThread, cmd: "checkMailbox" });
      } else {
        var worker = PThread.pthreads[targetThread];
        if (!worker) {
          return;
        }
        worker.postMessage({ cmd: "checkMailbox" });
      }
    };
    var proxiedJSCallArgs = [];
    var __emscripten_receive_on_main_thread_js = (
      funcIndex,
      emAsmAddr,
      callingThread,
      numCallArgs,
      args
    ) => {
      proxiedJSCallArgs.length = numCallArgs;
      var b = args >> 3;
      for (var i = 0; i < numCallArgs; i++) {
        proxiedJSCallArgs[i] = HEAPF64[b + i];
      }
      var func = proxiedFunctionTable[funcIndex];
      PThread.currentProxiedOperationCallerThread = callingThread;
      var rtn = func(...proxiedJSCallArgs);
      PThread.currentProxiedOperationCallerThread = 0;
      return rtn;
    };
    var __emscripten_runtime_keepalive_clear = () => {
      noExitRuntime = false;
      runtimeKeepaliveCounter = 0;
    };
    var __emscripten_thread_cleanup = (thread) => {
      if (!ENVIRONMENT_IS_PTHREAD) cleanupThread(thread);
      else postMessage({ cmd: "cleanupThread", thread });
    };
    var __emscripten_thread_set_strongref = (thread) => {
      if (ENVIRONMENT_IS_NODE) {
        PThread.pthreads[thread].ref();
      }
    };
    var isLeapYear = (year) =>
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    var MONTH_DAYS_LEAP_CUMULATIVE = [
      0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335,
    ];
    var MONTH_DAYS_REGULAR_CUMULATIVE = [
      0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
    ];
    var ydayFromDate = (date) => {
      var leap = isLeapYear(date.getFullYear());
      var monthDaysCumulative = leap
        ? MONTH_DAYS_LEAP_CUMULATIVE
        : MONTH_DAYS_REGULAR_CUMULATIVE;
      var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1;
      return yday;
    };
    function __localtime_js(time_low, time_high, tmPtr) {
      var time = convertI32PairToI53Checked(time_low, time_high);
      var date = new Date(time * 1e3);
      HEAP32[tmPtr >> 2] = date.getSeconds();
      HEAP32[(tmPtr + 4) >> 2] = date.getMinutes();
      HEAP32[(tmPtr + 8) >> 2] = date.getHours();
      HEAP32[(tmPtr + 12) >> 2] = date.getDate();
      HEAP32[(tmPtr + 16) >> 2] = date.getMonth();
      HEAP32[(tmPtr + 20) >> 2] = date.getFullYear() - 1900;
      HEAP32[(tmPtr + 24) >> 2] = date.getDay();
      var yday = ydayFromDate(date) | 0;
      HEAP32[(tmPtr + 28) >> 2] = yday;
      HEAP32[(tmPtr + 36) >> 2] = -(date.getTimezoneOffset() * 60);
      var start = new Date(date.getFullYear(), 0, 1);
      var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
      var winterOffset = start.getTimezoneOffset();
      var dst =
        (summerOffset != winterOffset &&
          date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
      HEAP32[(tmPtr + 32) >> 2] = dst;
    }
    var timers = {};
    var _emscripten_get_now;
    if (typeof performance != "undefined" && performance.now) {
      _emscripten_get_now = () => performance.timeOrigin + performance.now();
    } else {
      _emscripten_get_now = Date.now;
    }
    function __setitimer_js(which, timeout_ms) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(3, 0, 1, which, timeout_ms);
      if (timers[which]) {
        clearTimeout(timers[which].id);
        delete timers[which];
      }
      if (!timeout_ms) return 0;
      var id = setTimeout(() => {
        delete timers[which];
        callUserCallback(() =>
          __emscripten_timeout(which, _emscripten_get_now())
        );
      }, timeout_ms);
      timers[which] = { id, timeout_ms };
      return 0;
    }
    var __tzset_js = (timezone, daylight, std_name, dst_name) => {
      var currentYear = new Date().getFullYear();
      var winter = new Date(currentYear, 0, 1);
      var summer = new Date(currentYear, 6, 1);
      var winterOffset = winter.getTimezoneOffset();
      var summerOffset = summer.getTimezoneOffset();
      var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
      HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
      HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
      var extractZone = (timezoneOffset) => {
        var sign = timezoneOffset >= 0 ? "-" : "+";
        var absOffset = Math.abs(timezoneOffset);
        var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
        var minutes = String(absOffset % 60).padStart(2, "0");
        return `UTC${sign}${hours}${minutes}`;
      };
      var winterName = extractZone(winterOffset);
      var summerName = extractZone(summerOffset);
      if (summerOffset < winterOffset) {
        stringToUTF8(winterName, std_name, 17);
        stringToUTF8(summerName, dst_name, 17);
      } else {
        stringToUTF8(winterName, dst_name, 17);
        stringToUTF8(summerName, std_name, 17);
      }
    };
    var __wasmfs_copy_preloaded_file_data = (index, buffer) =>
      HEAPU8.set(wasmFSPreloadedFiles[index].fileData, buffer);
    var wasmFSPreloadedDirs = [];
    var __wasmfs_get_num_preloaded_dirs = () => wasmFSPreloadedDirs.length;
    var wasmFSPreloadedFiles = [];
    var wasmFSPreloadingFlushed = false;
    var __wasmfs_get_num_preloaded_files = () => {
      wasmFSPreloadingFlushed = true;
      return wasmFSPreloadedFiles.length;
    };
    var __wasmfs_get_preloaded_child_path = (index, childNameBuffer) => {
      var s = wasmFSPreloadedDirs[index].childName;
      var len = lengthBytesUTF8(s) + 1;
      stringToUTF8(s, childNameBuffer, len);
    };
    var __wasmfs_get_preloaded_file_mode = (index) =>
      wasmFSPreloadedFiles[index].mode;
    var __wasmfs_get_preloaded_file_size = (index) =>
      wasmFSPreloadedFiles[index].fileData.length;
    var __wasmfs_get_preloaded_parent_path = (index, parentPathBuffer) => {
      var s = wasmFSPreloadedDirs[index].parentPath;
      var len = lengthBytesUTF8(s) + 1;
      stringToUTF8(s, parentPathBuffer, len);
    };
    var __wasmfs_get_preloaded_path_name = (index, fileNameBuffer) => {
      var s = wasmFSPreloadedFiles[index].pathName;
      var len = lengthBytesUTF8(s) + 1;
      stringToUTF8(s, fileNameBuffer, len);
    };
    var __wasmfs_jsimpl_alloc_file = (backend, file) =>
      wasmFS$backends[backend].allocFile(file);
    var __wasmfs_jsimpl_free_file = (backend, file) =>
      wasmFS$backends[backend].freeFile(file);
    var __wasmfs_jsimpl_get_size = (backend, file) =>
      wasmFS$backends[backend].getSize(file);
    function __wasmfs_jsimpl_read(
      backend,
      file,
      buffer,
      length,
      offset_low,
      offset_high
    ) {
      var offset = convertI32PairToI53Checked(offset_low, offset_high);
      if (!wasmFS$backends[backend].read) {
        return -28;
      }
      return wasmFS$backends[backend].read(file, buffer, length, offset);
    }
    var __wasmfs_jsimpl_set_size = (backend, file, size) =>
      wasmFS$backends[backend].setSize(file, size);
    function __wasmfs_jsimpl_write(
      backend,
      file,
      buffer,
      length,
      offset_low,
      offset_high
    ) {
      var offset = convertI32PairToI53Checked(offset_low, offset_high);
      if (!wasmFS$backends[backend].write) {
        return -28;
      }
      return wasmFS$backends[backend].write(file, buffer, length, offset);
    }
    var FS_stdin_getChar_buffer = [];
    function intArrayFromString(stringy, dontAddNull, length) {
      var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
      var u8array = new Array(len);
      var numBytesWritten = stringToUTF8Array(
        stringy,
        u8array,
        0,
        u8array.length
      );
      if (dontAddNull) u8array.length = numBytesWritten;
      return u8array;
    }
    var FS_stdin_getChar = () => {
      if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          var BUFSIZE = 256;
          var buf = Buffer.alloc(BUFSIZE);
          var bytesRead = 0;
          var fd = process.stdin.fd;
          try {
            bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);
          } catch (e) {
            if (e.toString().includes("EOF")) bytesRead = 0;
            else throw e;
          }
          if (bytesRead > 0) {
            result = buf.slice(0, bytesRead).toString("utf-8");
          }
        } else if (
          typeof window != "undefined" &&
          typeof window.prompt == "function"
        ) {
          result = window.prompt("Input: ");
          if (result !== null) {
            result += "\n";
          }
        } else {
        }
        if (!result) {
          return null;
        }
        FS_stdin_getChar_buffer = intArrayFromString(result, true);
      }
      return FS_stdin_getChar_buffer.shift();
    };
    var __wasmfs_stdin_get_char = () => {
      var c = FS_stdin_getChar();
      if (typeof c === "number") {
        return c;
      }
      return -1;
    };
    var warnOnce = (text) => {
      warnOnce.shown ||= {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        if (ENVIRONMENT_IS_NODE) text = "warning: " + text;
        err(text);
      }
    };
    var _emscripten_check_blocking_allowed = () => {};
    var EmAudio = {};
    var EmAudioCounter = 0;
    var emscriptenRegisterAudioObject = (object) => {
      EmAudio[++EmAudioCounter] = object;
      return EmAudioCounter;
    };
    var emscriptenGetAudioObject = (objectHandle) => EmAudio[objectHandle];
    var _emscripten_create_audio_context = (options) => {
      let ctx = window.AudioContext || window.webkitAudioContext;
      options >>= 2;
      let opts = options
        ? {
            latencyHint: HEAPU32[options]
              ? UTF8ToString(HEAPU32[options])
              : void 0,
            sampleRate: HEAP32[options + 1] || void 0,
          }
        : void 0;
      return ctx && emscriptenRegisterAudioObject(new ctx(opts));
    };
    var _emscripten_create_wasm_audio_worklet_node = (
      contextHandle,
      name,
      options,
      callback,
      userData
    ) => {
      options >>= 2;
      function readChannelCountArray(heapIndex, numOutputs) {
        let channelCounts = [];
        while (numOutputs--) channelCounts.push(HEAPU32[heapIndex++]);
        return channelCounts;
      }
      let opts = options
        ? {
            numberOfInputs: HEAP32[options],
            numberOfOutputs: HEAP32[options + 1],
            outputChannelCount: HEAPU32[options + 2]
              ? readChannelCountArray(
                  HEAPU32[options + 2] >> 2,
                  HEAP32[options + 1]
                )
              : void 0,
            processorOptions: { cb: callback, ud: userData },
          }
        : void 0;
      return emscriptenRegisterAudioObject(
        new AudioWorkletNode(EmAudio[contextHandle], UTF8ToString(name), opts)
      );
    };
    var _emscripten_create_wasm_audio_worklet_processor_async = (
      contextHandle,
      options,
      callback,
      userData
    ) => {
      options >>= 2;
      let audioParams = [],
        numAudioParams = HEAPU32[options + 1],
        audioParamDescriptors = HEAPU32[options + 2] >> 2,
        i = 0;
      while (numAudioParams--) {
        audioParams.push({
          name: i++,
          defaultValue: HEAPF32[audioParamDescriptors++],
          minValue: HEAPF32[audioParamDescriptors++],
          maxValue: HEAPF32[audioParamDescriptors++],
          automationRate:
            ["a", "k"][HEAPU32[audioParamDescriptors++]] + "-rate",
        });
      }
      EmAudio[contextHandle].audioWorklet.bootstrapMessage.port.postMessage({
        _wpn: UTF8ToString(HEAPU32[options]),
        ap: audioParams,
        ch: contextHandle,
        cb: callback,
        ud: userData,
      });
    };
    var _emscripten_date_now = () => Date.now();
    var _emscripten_err = (str) => err(UTF8ToString(str));
    var runtimeKeepalivePush = () => {
      runtimeKeepaliveCounter += 1;
    };
    var _emscripten_exit_with_live_runtime = () => {
      runtimeKeepalivePush();
      throw "unwind";
    };
    var _emscripten_out = (str) => out(UTF8ToString(str));
    var abortOnCannotGrowMemory = (requestedSize) => {
      abort("OOM");
    };
    var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      requestedSize >>>= 0;
      abortOnCannotGrowMemory(requestedSize);
    };
    var _emscripten_resume_audio_context_sync = (contextHandle) => {
      EmAudio[contextHandle].resume();
    };
    var _emscripten_set_main_loop_timing = (mode, value) => {
      MainLoop.timingMode = mode;
      MainLoop.timingValue = value;
      if (!MainLoop.func) {
        return 1;
      }
      if (!MainLoop.running) {
        runtimeKeepalivePush();
        MainLoop.running = true;
      }
      if (mode == 0) {
        MainLoop.scheduler = function MainLoop_scheduler_setTimeout() {
          var timeUntilNextTick =
            Math.max(
              0,
              MainLoop.tickStartTime + value - _emscripten_get_now()
            ) | 0;
          setTimeout(MainLoop.runner, timeUntilNextTick);
        };
        MainLoop.method = "timeout";
      } else if (mode == 1) {
        MainLoop.scheduler = function MainLoop_scheduler_rAF() {
          MainLoop.requestAnimationFrame(MainLoop.runner);
        };
        MainLoop.method = "rAF";
      } else if (mode == 2) {
        if (typeof MainLoop.setImmediate == "undefined") {
          if (typeof setImmediate == "undefined") {
            var setImmediates = [];
            var emscriptenMainLoopMessageId = "setimmediate";
            var MainLoop_setImmediate_messageHandler = (event) => {
              if (
                event.data === emscriptenMainLoopMessageId ||
                event.data.target === emscriptenMainLoopMessageId
              ) {
                event.stopPropagation();
                setImmediates.shift()();
              }
            };
            addEventListener(
              "message",
              MainLoop_setImmediate_messageHandler,
              true
            );
            MainLoop.setImmediate = (func) => {
              setImmediates.push(func);
              if (ENVIRONMENT_IS_WORKER) {
                Module["setImmediates"] ??= [];
                Module["setImmediates"].push(func);
                postMessage({ target: emscriptenMainLoopMessageId });
              } else postMessage(emscriptenMainLoopMessageId, "*");
            };
          } else {
            MainLoop.setImmediate = setImmediate;
          }
        }
        MainLoop.scheduler = function MainLoop_scheduler_setImmediate() {
          MainLoop.setImmediate(MainLoop.runner);
        };
        MainLoop.method = "immediate";
      }
      return 0;
    };
    var MainLoop = {
      running: false,
      scheduler: null,
      method: "",
      currentlyRunningMainloop: 0,
      func: null,
      arg: 0,
      timingMode: 0,
      timingValue: 0,
      currentFrameNumber: 0,
      queue: [],
      preMainLoop: [],
      postMainLoop: [],
      pause() {
        MainLoop.scheduler = null;
        MainLoop.currentlyRunningMainloop++;
      },
      resume() {
        MainLoop.currentlyRunningMainloop++;
        var timingMode = MainLoop.timingMode;
        var timingValue = MainLoop.timingValue;
        var func = MainLoop.func;
        MainLoop.func = null;
        setMainLoop(func, 0, false, MainLoop.arg, true);
        _emscripten_set_main_loop_timing(timingMode, timingValue);
        MainLoop.scheduler();
      },
      updateStatus() {
        if (Module["setStatus"]) {
          var message = Module["statusMessage"] || "Please wait...";
          var remaining = MainLoop.remainingBlockers ?? 0;
          var expected = MainLoop.expectedBlockers ?? 0;
          if (remaining) {
            if (remaining < expected) {
              Module["setStatus"](
                `{message} ({expected - remaining}/{expected})`
              );
            } else {
              Module["setStatus"](message);
            }
          } else {
            Module["setStatus"]("");
          }
        }
      },
      init() {
        Module["preMainLoop"] &&
          MainLoop.preMainLoop.push(Module["preMainLoop"]);
        Module["postMainLoop"] &&
          MainLoop.postMainLoop.push(Module["postMainLoop"]);
      },
      runIter(func) {
        if (ABORT) return;
        for (var pre of MainLoop.preMainLoop) {
          if (pre() === false) {
            return;
          }
        }
        callUserCallback(func);
        for (var post of MainLoop.postMainLoop) {
          post();
        }
      },
      nextRAF: 0,
      fakeRequestAnimationFrame(func) {
        var now = Date.now();
        if (MainLoop.nextRAF === 0) {
          MainLoop.nextRAF = now + 1e3 / 60;
        } else {
          while (now + 2 >= MainLoop.nextRAF) {
            MainLoop.nextRAF += 1e3 / 60;
          }
        }
        var delay = Math.max(MainLoop.nextRAF - now, 0);
        setTimeout(func, delay);
      },
      requestAnimationFrame(func) {
        if (typeof requestAnimationFrame == "function") {
          requestAnimationFrame(func);
          return;
        }
        var RAF = MainLoop.fakeRequestAnimationFrame;
        RAF(func);
      },
    };
    var runtimeKeepalivePop = () => {
      runtimeKeepaliveCounter -= 1;
    };
    var setMainLoop = (
      iterFunc,
      fps,
      simulateInfiniteLoop,
      arg,
      noSetTiming
    ) => {
      MainLoop.func = iterFunc;
      MainLoop.arg = arg;
      var thisMainLoopId = MainLoop.currentlyRunningMainloop;
      function checkIsRunning() {
        if (thisMainLoopId < MainLoop.currentlyRunningMainloop) {
          runtimeKeepalivePop();
          maybeExit();
          return false;
        }
        return true;
      }
      MainLoop.running = false;
      MainLoop.runner = function MainLoop_runner() {
        if (ABORT) return;
        if (MainLoop.queue.length > 0) {
          var start = Date.now();
          var blocker = MainLoop.queue.shift();
          blocker.func(blocker.arg);
          if (MainLoop.remainingBlockers) {
            var remaining = MainLoop.remainingBlockers;
            var next =
              remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
            if (blocker.counted) {
              MainLoop.remainingBlockers = next;
            } else {
              next = next + 0.5;
              MainLoop.remainingBlockers = (8 * remaining + next) / 9;
            }
          }
          MainLoop.updateStatus();
          if (!checkIsRunning()) return;
          setTimeout(MainLoop.runner, 0);
          return;
        }
        if (!checkIsRunning()) return;
        MainLoop.currentFrameNumber = (MainLoop.currentFrameNumber + 1) | 0;
        if (
          MainLoop.timingMode == 1 &&
          MainLoop.timingValue > 1 &&
          MainLoop.currentFrameNumber % MainLoop.timingValue != 0
        ) {
          MainLoop.scheduler();
          return;
        } else if (MainLoop.timingMode == 0) {
          MainLoop.tickStartTime = _emscripten_get_now();
        }
        MainLoop.runIter(iterFunc);
        if (!checkIsRunning()) return;
        MainLoop.scheduler();
      };
      if (!noSetTiming) {
        if (fps && fps > 0) {
          _emscripten_set_main_loop_timing(0, 1e3 / fps);
        } else {
          _emscripten_set_main_loop_timing(1, 1);
        }
        MainLoop.scheduler();
      }
      if (simulateInfiniteLoop) {
        throw "unwind";
      }
    };
    var _emscripten_set_main_loop = (func, fps, simulateInfiniteLoop) => {
      var iterFunc = getWasmTableEntry(func);
      setMainLoop(iterFunc, fps, simulateInfiniteLoop);
    };
    var _wasmWorkersID = 1;
    var _EmAudioDispatchProcessorCallback = (e) => {
      let data = e.data;
      let wasmCall = data["_wsc"];
      wasmCall && getWasmTableEntry(wasmCall)(...data["x"]);
    };
    var _emscripten_start_wasm_audio_worklet_thread_async = (
      contextHandle,
      stackLowestAddress,
      stackSize,
      callback,
      userData
    ) => {
      let audioContext = EmAudio[contextHandle],
        audioWorklet = audioContext.audioWorklet;
      let audioWorkletCreationFailed = () => {
        getWasmTableEntry(callback)(contextHandle, 0, userData);
      };
      if (!audioWorklet) {
        return audioWorkletCreationFailed();
      }

      audioWorklet
        //Aslo had to add this line to access pd4web.aw.js from root public folder
        .addModule("/pd4web/pd4web.aw.js")
        .then(() => {
          audioWorklet.bootstrapMessage = new AudioWorkletNode(
            audioContext,
            "message",
            {
              processorOptions: {
                $ww: _wasmWorkersID++,
                wasm: wasmModule,
                wasmMemory,
                sb: stackLowestAddress,
                sz: stackSize,
              },
            }
          );
          audioWorklet.bootstrapMessage.port.onmessage =
            _EmAudioDispatchProcessorCallback;
          return audioWorklet.addModule(
            Module["mainScriptUrlOrBlob"] || _scriptName
          );
        })
        .then(() => {
          getWasmTableEntry(callback)(contextHandle, 1, userData);
        })
        .catch(audioWorkletCreationFailed);
    };
    var _emscripten_unwind_to_js_event_loop = () => {
      throw "unwind";
    };
    var ENV = {};
    var getExecutableName = () => thisProgram || "./this.program";
    var getEnvStrings = () => {
      if (!getEnvStrings.strings) {
        var lang =
          (
            (typeof navigator == "object" &&
              navigator.languages &&
              navigator.languages[0]) ||
            "C"
          ).replace("-", "_") + ".UTF-8";
        var env = {
          USER: "web_user",
          LOGNAME: "web_user",
          PATH: "/",
          PWD: "/",
          HOME: "/home/web_user",
          LANG: lang,
          _: getExecutableName(),
        };
        for (var x in ENV) {
          if (ENV[x] === undefined) delete env[x];
          else env[x] = ENV[x];
        }
        var strings = [];
        for (var x in env) {
          strings.push(`${x}=${env[x]}`);
        }
        getEnvStrings.strings = strings;
      }
      return getEnvStrings.strings;
    };
    var stringToAscii = (str, buffer) => {
      for (var i = 0; i < str.length; ++i) {
        HEAP8[buffer++] = str.charCodeAt(i);
      }
      HEAP8[buffer] = 0;
    };
    var _environ_get = function (__environ, environ_buf) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(4, 0, 1, __environ, environ_buf);
      var bufSize = 0;
      getEnvStrings().forEach((string, i) => {
        var ptr = environ_buf + bufSize;
        HEAPU32[(__environ + i * 4) >> 2] = ptr;
        stringToAscii(string, ptr);
        bufSize += string.length + 1;
      });
      return 0;
    };
    var _environ_sizes_get = function (penviron_count, penviron_buf_size) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(5, 0, 1, penviron_count, penviron_buf_size);
      var strings = getEnvStrings();
      HEAPU32[penviron_count >> 2] = strings.length;
      var bufSize = 0;
      strings.forEach((string) => (bufSize += string.length + 1));
      HEAPU32[penviron_buf_size >> 2] = bufSize;
      return 0;
    };
    var inetPton4 = (str) => {
      var b = str.split(".");
      for (var i = 0; i < 4; i++) {
        var tmp = Number(b[i]);
        if (isNaN(tmp)) return null;
        b[i] = tmp;
      }
      return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0;
    };
    var jstoi_q = (str) => parseInt(str);
    var inetPton6 = (str) => {
      var words;
      var w, offset, z;
      var valid6regx =
        /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i;
      var parts = [];
      if (!valid6regx.test(str)) {
        return null;
      }
      if (str === "::") {
        return [0, 0, 0, 0, 0, 0, 0, 0];
      }
      if (str.startsWith("::")) {
        str = str.replace("::", "Z:");
      } else {
        str = str.replace("::", ":Z:");
      }
      if (str.indexOf(".") > 0) {
        str = str.replace(new RegExp("[.]", "g"), ":");
        words = str.split(":");
        words[words.length - 4] =
          jstoi_q(words[words.length - 4]) +
          jstoi_q(words[words.length - 3]) * 256;
        words[words.length - 3] =
          jstoi_q(words[words.length - 2]) +
          jstoi_q(words[words.length - 1]) * 256;
        words = words.slice(0, words.length - 2);
      } else {
        words = str.split(":");
      }
      offset = 0;
      z = 0;
      for (w = 0; w < words.length; w++) {
        if (typeof words[w] == "string") {
          if (words[w] === "Z") {
            for (z = 0; z < 8 - words.length + 1; z++) {
              parts[w + z] = 0;
            }
            offset = z - 1;
          } else {
            parts[w + offset] = _htons(parseInt(words[w], 16));
          }
        } else {
          parts[w + offset] = words[w];
        }
      }
      return [
        (parts[1] << 16) | parts[0],
        (parts[3] << 16) | parts[2],
        (parts[5] << 16) | parts[4],
        (parts[7] << 16) | parts[6],
      ];
    };
    var DNS = {
      address_map: { id: 1, addrs: {}, names: {} },
      lookup_name(name) {
        var res = inetPton4(name);
        if (res !== null) {
          return name;
        }
        res = inetPton6(name);
        if (res !== null) {
          return name;
        }
        var addr;
        if (DNS.address_map.addrs[name]) {
          addr = DNS.address_map.addrs[name];
        } else {
          var id = DNS.address_map.id++;
          assert(id < 65535, "exceeded max address mappings of 65535");
          addr = "172.29." + (id & 255) + "." + (id & 65280);
          DNS.address_map.names[addr] = name;
          DNS.address_map.addrs[name] = addr;
        }
        return addr;
      },
      lookup_addr(addr) {
        if (DNS.address_map.names[addr]) {
          return DNS.address_map.names[addr];
        }
        return null;
      },
    };
    var inetNtop4 = (addr) =>
      (addr & 255) +
      "." +
      ((addr >> 8) & 255) +
      "." +
      ((addr >> 16) & 255) +
      "." +
      ((addr >> 24) & 255);
    var inetNtop6 = (ints) => {
      var str = "";
      var word = 0;
      var longest = 0;
      var lastzero = 0;
      var zstart = 0;
      var len = 0;
      var i = 0;
      var parts = [
        ints[0] & 65535,
        ints[0] >> 16,
        ints[1] & 65535,
        ints[1] >> 16,
        ints[2] & 65535,
        ints[2] >> 16,
        ints[3] & 65535,
        ints[3] >> 16,
      ];
      var hasipv4 = true;
      var v4part = "";
      for (i = 0; i < 5; i++) {
        if (parts[i] !== 0) {
          hasipv4 = false;
          break;
        }
      }
      if (hasipv4) {
        v4part = inetNtop4(parts[6] | (parts[7] << 16));
        if (parts[5] === -1) {
          str = "::ffff:";
          str += v4part;
          return str;
        }
        if (parts[5] === 0) {
          str = "::";
          if (v4part === "0.0.0.0") v4part = "";
          if (v4part === "0.0.0.1") v4part = "1";
          str += v4part;
          return str;
        }
      }
      for (word = 0; word < 8; word++) {
        if (parts[word] === 0) {
          if (word - lastzero > 1) {
            len = 0;
          }
          lastzero = word;
          len++;
        }
        if (len > longest) {
          longest = len;
          zstart = word - longest + 1;
        }
      }
      for (word = 0; word < 8; word++) {
        if (longest > 1) {
          if (parts[word] === 0 && word >= zstart && word < zstart + longest) {
            if (word === zstart) {
              str += ":";
              if (zstart === 0) str += ":";
            }
            continue;
          }
        }
        str += Number(_ntohs(parts[word] & 65535)).toString(16);
        str += word < 7 ? ":" : "";
      }
      return str;
    };
    var zeroMemory = (address, size) => {
      HEAPU8.fill(0, address, address + size);
      return address;
    };
    var writeSockaddr = (sa, family, addr, port, addrlen) => {
      switch (family) {
        case 2:
          addr = inetPton4(addr);
          zeroMemory(sa, 16);
          if (addrlen) {
            HEAP32[addrlen >> 2] = 16;
          }
          HEAP16[sa >> 1] = family;
          HEAP32[(sa + 4) >> 2] = addr;
          HEAP16[(sa + 2) >> 1] = _htons(port);
          break;
        case 10:
          addr = inetPton6(addr);
          zeroMemory(sa, 28);
          if (addrlen) {
            HEAP32[addrlen >> 2] = 28;
          }
          HEAP32[sa >> 2] = family;
          HEAP32[(sa + 8) >> 2] = addr[0];
          HEAP32[(sa + 12) >> 2] = addr[1];
          HEAP32[(sa + 16) >> 2] = addr[2];
          HEAP32[(sa + 20) >> 2] = addr[3];
          HEAP16[(sa + 2) >> 1] = _htons(port);
          break;
        default:
          return 5;
      }
      return 0;
    };
    function _getaddrinfo(node, service, hint, out) {
      if (ENVIRONMENT_IS_PTHREAD)
        return proxyToMainThread(6, 0, 1, node, service, hint, out);
      var addr = 0;
      var port = 0;
      var flags = 0;
      var family = 0;
      var type = 0;
      var proto = 0;
      var ai;
      function allocaddrinfo(family, type, proto, canon, addr, port) {
        var sa, salen, ai;
        var errno;
        salen = family === 10 ? 28 : 16;
        addr = family === 10 ? inetNtop6(addr) : inetNtop4(addr);
        sa = _malloc(salen);
        errno = writeSockaddr(sa, family, addr, port);
        assert(!errno);
        ai = _malloc(32);
        HEAP32[(ai + 4) >> 2] = family;
        HEAP32[(ai + 8) >> 2] = type;
        HEAP32[(ai + 12) >> 2] = proto;
        HEAPU32[(ai + 24) >> 2] = canon;
        HEAPU32[(ai + 20) >> 2] = sa;
        if (family === 10) {
          HEAP32[(ai + 16) >> 2] = 28;
        } else {
          HEAP32[(ai + 16) >> 2] = 16;
        }
        HEAP32[(ai + 28) >> 2] = 0;
        return ai;
      }
      if (hint) {
        flags = HEAP32[hint >> 2];
        family = HEAP32[(hint + 4) >> 2];
        type = HEAP32[(hint + 8) >> 2];
        proto = HEAP32[(hint + 12) >> 2];
      }
      if (type && !proto) {
        proto = type === 2 ? 17 : 6;
      }
      if (!type && proto) {
        type = proto === 17 ? 2 : 1;
      }
      if (proto === 0) {
        proto = 6;
      }
      if (type === 0) {
        type = 1;
      }
      if (!node && !service) {
        return -2;
      }
      if (flags & ~(1 | 2 | 4 | 1024 | 8 | 16 | 32)) {
        return -1;
      }
      if (hint !== 0 && HEAP32[hint >> 2] & 2 && !node) {
        return -1;
      }
      if (flags & 32) {
        return -2;
      }
      if (type !== 0 && type !== 1 && type !== 2) {
        return -7;
      }
      if (family !== 0 && family !== 2 && family !== 10) {
        return -6;
      }
      if (service) {
        service = UTF8ToString(service);
        port = parseInt(service, 10);
        if (isNaN(port)) {
          if (flags & 1024) {
            return -2;
          }
          return -8;
        }
      }
      if (!node) {
        if (family === 0) {
          family = 2;
        }
        if ((flags & 1) === 0) {
          if (family === 2) {
            addr = _htonl(2130706433);
          } else {
            addr = [0, 0, 0, 1];
          }
        }
        ai = allocaddrinfo(family, type, proto, null, addr, port);
        HEAPU32[out >> 2] = ai;
        return 0;
      }
      node = UTF8ToString(node);
      addr = inetPton4(node);
      if (addr !== null) {
        if (family === 0 || family === 2) {
          family = 2;
        } else if (family === 10 && flags & 8) {
          addr = [0, 0, _htonl(65535), addr];
          family = 10;
        } else {
          return -2;
        }
      } else {
        addr = inetPton6(node);
        if (addr !== null) {
          if (family === 0 || family === 10) {
            family = 10;
          } else {
            return -2;
          }
        }
      }
      if (addr != null) {
        ai = allocaddrinfo(family, type, proto, node, addr, port);
        HEAPU32[out >> 2] = ai;
        return 0;
      }
      if (flags & 4) {
        return -2;
      }
      node = DNS.lookup_name(node);
      addr = inetPton4(node);
      if (family === 0) {
        family = 2;
      } else if (family === 10) {
        addr = [0, 0, _htonl(65535), addr];
      }
      ai = allocaddrinfo(family, type, proto, null, addr, port);
      HEAPU32[out >> 2] = ai;
      return 0;
    }
    var initRandomFill = () => {
      if (
        typeof crypto == "object" &&
        typeof crypto["getRandomValues"] == "function"
      ) {
        return (view) => (
          view.set(crypto.getRandomValues(new Uint8Array(view.byteLength))),
          view
        );
      } else if (ENVIRONMENT_IS_NODE) {
        try {
          var crypto_module = require("crypto");
          var randomFillSync = crypto_module["randomFillSync"];
          if (randomFillSync) {
            return (view) => crypto_module["randomFillSync"](view);
          }
          var randomBytes = crypto_module["randomBytes"];
          return (view) => (view.set(randomBytes(view.byteLength)), view);
        } catch (e) {}
      }
      abort("initRandomDevice");
    };
    var randomFill = (view) => (randomFill = initRandomFill())(view);
    var _getentropy = (buffer, size) => {
      randomFill(HEAPU8.subarray(buffer, buffer + size));
      return 0;
    };
    var PATH = {
      isAbs: (path) => path.charAt(0) === "/",
      splitPath: (filename) => {
        var splitPathRe =
          /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },
      normalizeArray: (parts, allowAboveRoot) => {
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === ".") {
            parts.splice(i, 1);
          } else if (last === "..") {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift("..");
          }
        }
        return parts;
      },
      normalize: (path) => {
        var isAbsolute = PATH.isAbs(path),
          trailingSlash = path.substr(-1) === "/";
        path = PATH.normalizeArray(
          path.split("/").filter((p) => !!p),
          !isAbsolute
        ).join("/");
        if (!path && !isAbsolute) {
          path = ".";
        }
        if (path && trailingSlash) {
          path += "/";
        }
        return (isAbsolute ? "/" : "") + path;
      },
      dirname: (path) => {
        var result = PATH.splitPath(path),
          root = result[0],
          dir = result[1];
        if (!root && !dir) {
          return ".";
        }
        if (dir) {
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },
      basename: (path) => {
        if (path === "/") return "/";
        path = PATH.normalize(path);
        path = path.replace(/\/$/, "");
        var lastSlash = path.lastIndexOf("/");
        if (lastSlash === -1) return path;
        return path.substr(lastSlash + 1);
      },
      join: (...paths) => PATH.normalize(paths.join("/")),
      join2: (l, r) => PATH.normalize(l + "/" + r),
    };
    var stringToUTF8OnStack = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    };
    var withStackSave = (f) => {
      var stack = stackSave();
      var ret = f();
      stackRestore(stack);
      return ret;
    };
    var readI53FromI64 = (ptr) =>
      HEAPU32[ptr >> 2] + HEAP32[(ptr + 4) >> 2] * 4294967296;
    var readI53FromU64 = (ptr) =>
      HEAPU32[ptr >> 2] + HEAPU32[(ptr + 4) >> 2] * 4294967296;
    var FS_mknod = (path, mode, dev) =>
      FS.handleError(
        withStackSave(() => {
          var pathBuffer = stringToUTF8OnStack(path);
          return __wasmfs_mknod(pathBuffer, mode, dev);
        })
      );
    var FS_create = (path, mode = 438) => {
      mode &= 4095;
      mode |= 32768;
      return FS_mknod(path, mode, 0);
    };
    var FS_writeFile = (path, data) => {
      var sp = stackSave();
      var pathBuffer = stringToUTF8OnStack(path);
      if (typeof data == "string") {
        var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
        var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
        data = buf.slice(0, actualNumBytes);
      }
      var dataBuffer = _malloc(data.length);
      for (var i = 0; i < data.length; i++) {
        HEAP8[dataBuffer + i] = data[i];
      }
      var ret = __wasmfs_write_file(pathBuffer, dataBuffer, data.length);
      _free(dataBuffer);
      stackRestore(sp);
      return ret;
    };
    var FS_createDataFile = (
      parent,
      name,
      fileData,
      canRead,
      canWrite,
      canOwn
    ) => {
      var pathName = name ? parent + "/" + name : parent;
      var mode = FS_getMode(canRead, canWrite);
      if (!wasmFSPreloadingFlushed) {
        wasmFSPreloadedFiles.push({ pathName, fileData, mode });
      } else {
        FS_create(pathName, mode);
        FS_writeFile(pathName, fileData);
      }
    };
    var asyncLoad = (url, onload, onerror, noRunDep) => {
      var dep = !noRunDep ? getUniqueRunDependency(`al ${url}`) : "";
      readAsync(url).then(
        (arrayBuffer) => {
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        },
        (err) => {
          if (onerror) {
            onerror();
          } else {
            throw `Loading data file "${url}" failed.`;
          }
        }
      );
      if (dep) addRunDependency(dep);
    };
    var PATH_FS = {
      resolve: (...args) => {
        var resolvedPath = "",
          resolvedAbsolute = false;
        for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = i >= 0 ? args[i] : FS.cwd();
          if (typeof path != "string") {
            throw new TypeError("Arguments to path.resolve must be strings");
          } else if (!path) {
            return "";
          }
          resolvedPath = path + "/" + resolvedPath;
          resolvedAbsolute = PATH.isAbs(path);
        }
        resolvedPath = PATH.normalizeArray(
          resolvedPath.split("/").filter((p) => !!p),
          !resolvedAbsolute
        ).join("/");
        return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
      },
      relative: (from, to) => {
        from = PATH_FS.resolve(from).substr(1);
        to = PATH_FS.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== "") break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== "") break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split("/"));
        var toParts = trim(to.split("/"));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push("..");
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join("/");
      },
    };
    var preloadPlugins = Module["preloadPlugins"] || [];
    var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
      if (typeof Browser != "undefined") Browser.init();
      var handled = false;
      preloadPlugins.forEach((plugin) => {
        if (handled) return;
        if (plugin["canHandle"](fullname)) {
          plugin["handle"](byteArray, fullname, finish, onerror);
          handled = true;
        }
      });
      return handled;
    };
    var FS_createPreloadedFile = (
      parent,
      name,
      url,
      canRead,
      canWrite,
      onload,
      onerror,
      dontCreateFile,
      canOwn,
      preFinish
    ) => {
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency(`cp ${fullname}`);
      function processData(byteArray) {
        function finish(byteArray) {
          preFinish?.();
          if (!dontCreateFile) {
            FS_createDataFile(
              parent,
              name,
              byteArray,
              canRead,
              canWrite,
              canOwn
            );
          }
          onload?.();
          removeRunDependency(dep);
        }
        if (
          FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
            onerror?.();
            removeRunDependency(dep);
          })
        ) {
          return;
        }
        finish(byteArray);
      }
      addRunDependency(dep);
      if (typeof url == "string") {
        asyncLoad(url, processData, onerror);
      } else {
        processData(url);
      }
    };
    var FS_getMode = (canRead, canWrite) => {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    };
    var FS_modeStringToFlags = (str) => {
      var flagModes = {
        r: 0,
        "r+": 2,
        w: 512 | 64 | 1,
        "w+": 512 | 64 | 2,
        a: 1024 | 64 | 1,
        "a+": 1024 | 64 | 2,
      };
      var flags = flagModes[str];
      if (typeof flags == "undefined") {
        throw new Error(`Unknown file open mode: ${str}`);
      }
      return flags;
    };
    var FS_mkdir = (path, mode = 511) =>
      FS.handleError(
        withStackSave(() => {
          var buffer = stringToUTF8OnStack(path);
          return __wasmfs_mkdir(buffer, mode);
        })
      );
    var FS_mkdirTree = (path, mode) => {
      var dirs = path.split("/");
      var d = "";
      for (var i = 0; i < dirs.length; ++i) {
        if (!dirs[i]) continue;
        d += "/" + dirs[i];
        try {
          FS_mkdir(d, mode);
        } catch (e) {
          if (e.errno != 20) throw e;
        }
      }
    };
    var FS_unlink = (path) =>
      withStackSave(() => {
        var buffer = stringToUTF8OnStack(path);
        return __wasmfs_unlink(buffer);
      });
    var wasmFS$backends = {};
    var wasmFSDevices = {};
    var wasmFSDeviceStreams = {};
    var FS = {
      init() {
        FS.ensureErrnoError();
      },
      ErrnoError: null,
      handleError(returnValue) {
        if (returnValue < 0) {
          throw new FS.ErrnoError(-returnValue);
        }
        return returnValue;
      },
      ensureErrnoError() {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(code) {
          this.errno = code;
          this.message = "FS error";
          this.name = "ErrnoError";
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
      },
      createDataFile(parent, name, fileData, canRead, canWrite, canOwn) {
        FS_createDataFile(parent, name, fileData, canRead, canWrite, canOwn);
      },
      createPath(parent, path, canRead, canWrite) {
        var parts = path.split("/").reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          if (!wasmFSPreloadingFlushed) {
            wasmFSPreloadedDirs.push({ parentPath: parent, childName: part });
          } else {
            FS.mkdir(current);
          }
          parent = current;
        }
        return current;
      },
      createPreloadedFile(
        parent,
        name,
        url,
        canRead,
        canWrite,
        onload,
        onerror,
        dontCreateFile,
        canOwn,
        preFinish
      ) {
        return FS_createPreloadedFile(
          parent,
          name,
          url,
          canRead,
          canWrite,
          onload,
          onerror,
          dontCreateFile,
          canOwn,
          preFinish
        );
      },
      readFile(path, opts = {}) {
        opts.encoding = opts.encoding || "binary";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var sp = stackSave();
        var buf = __wasmfs_read_file(stringToUTF8OnStack(path));
        stackRestore(sp);
        var length = readI53FromI64(buf);
        var ret = new Uint8Array(HEAPU8.subarray(buf + 8, buf + 8 + length));
        if (opts.encoding === "utf8") {
          ret = UTF8ArrayToString(ret, 0);
        }
        return ret;
      },
      cwd: () => UTF8ToString(__wasmfs_get_cwd()),
      analyzePath(path) {
        var exists = !!FS.findObject(path);
        return {
          exists,
          object: { contents: exists ? FS.readFile(path) : null },
        };
      },
      mkdir: (path, mode) => FS_mkdir(path, mode),
      mkdirTree: (path, mode) => FS_mkdirTree(path, mode),
      rmdir: (path) =>
        FS.handleError(
          withStackSave(() => __wasmfs_rmdir(stringToUTF8OnStack(path)))
        ),
      open: (path, flags, mode) =>
        withStackSave(() => {
          flags =
            typeof flags == "string" ? FS_modeStringToFlags(flags) : flags;
          mode = typeof mode == "undefined" ? 438 : mode;
          var buffer = stringToUTF8OnStack(path);
          var fd = FS.handleError(__wasmfs_open(buffer, flags, mode));
          return { fd };
        }),
      create: (path, mode) => FS_create(path, mode),
      close: (stream) => FS.handleError(-__wasmfs_close(stream.fd)),
      unlink: (path) => FS_unlink(path),
      chdir: (path) =>
        withStackSave(() => {
          var buffer = stringToUTF8OnStack(path);
          return __wasmfs_chdir(buffer);
        }),
      read(stream, buffer, offset, length, position) {
        var seeking = typeof position != "undefined";
        var dataBuffer = _malloc(length);
        var bytesRead;
        if (seeking) {
          bytesRead = __wasmfs_pread(stream.fd, dataBuffer, length, position);
        } else {
          bytesRead = __wasmfs_read(stream.fd, dataBuffer, length);
        }
        bytesRead = FS.handleError(bytesRead);
        for (var i = 0; i < length; i++) {
          buffer[offset + i] = HEAP8[dataBuffer + i];
        }
        _free(dataBuffer);
        return bytesRead;
      },
      write(stream, buffer, offset, length, position, canOwn) {
        var seeking = typeof position != "undefined";
        var dataBuffer = _malloc(length);
        for (var i = 0; i < length; i++) {
          HEAP8[dataBuffer + i] = buffer[offset + i];
        }
        var bytesRead;
        if (seeking) {
          bytesRead = __wasmfs_pwrite(stream.fd, dataBuffer, length, position);
        } else {
          bytesRead = __wasmfs_write(stream.fd, dataBuffer, length);
        }
        bytesRead = FS.handleError(bytesRead);
        _free(dataBuffer);
        return bytesRead;
      },
      allocate(stream, offset, length) {
        return FS.handleError(
          __wasmfs_allocate(
            stream.fd,
            offset >>> 0,
            ((tempDouble = offset),
            +Math.abs(tempDouble) >= 1
              ? tempDouble > 0
                ? +Math.floor(tempDouble / 4294967296) >>> 0
                : ~~+Math.ceil(
                    (tempDouble - +(~~tempDouble >>> 0)) / 4294967296
                  ) >>> 0
              : 0),
            length >>> 0,
            ((tempDouble = length),
            +Math.abs(tempDouble) >= 1
              ? tempDouble > 0
                ? +Math.floor(tempDouble / 4294967296) >>> 0
                : ~~+Math.ceil(
                    (tempDouble - +(~~tempDouble >>> 0)) / 4294967296
                  ) >>> 0
              : 0)
          )
        );
      },
      writeFile: (path, data) => FS_writeFile(path, data),
      mmap: (stream, length, offset, prot, flags) => {
        var buf = FS.handleError(
          __wasmfs_mmap(
            length,
            prot,
            flags,
            stream.fd,
            offset >>> 0,
            ((tempDouble = offset),
            +Math.abs(tempDouble) >= 1
              ? tempDouble > 0
                ? +Math.floor(tempDouble / 4294967296) >>> 0
                : ~~+Math.ceil(
                    (tempDouble - +(~~tempDouble >>> 0)) / 4294967296
                  ) >>> 0
              : 0)
          )
        );
        return { ptr: buf, allocated: true };
      },
      msync: (stream, bufferPtr, offset, length, mmapFlags) => {
        assert(offset === 0);
        return FS.handleError(__wasmfs_msync(bufferPtr, length, mmapFlags));
      },
      munmap: (addr, length) => FS.handleError(__wasmfs_munmap(addr, length)),
      symlink: (target, linkpath) =>
        withStackSave(() =>
          __wasmfs_symlink(
            stringToUTF8OnStack(target),
            stringToUTF8OnStack(linkpath)
          )
        ),
      readlink(path) {
        var readBuffer = FS.handleError(
          withStackSave(() => __wasmfs_readlink(stringToUTF8OnStack(path)))
        );
        return UTF8ToString(readBuffer);
      },
      statBufToObject(statBuf) {
        return {
          dev: HEAPU32[statBuf >> 2],
          mode: HEAPU32[(statBuf + 4) >> 2],
          nlink: HEAPU32[(statBuf + 8) >> 2],
          uid: HEAPU32[(statBuf + 12) >> 2],
          gid: HEAPU32[(statBuf + 16) >> 2],
          rdev: HEAPU32[(statBuf + 20) >> 2],
          size: readI53FromI64(statBuf + 24),
          blksize: HEAPU32[(statBuf + 32) >> 2],
          blocks: HEAPU32[(statBuf + 36) >> 2],
          atime: readI53FromI64(statBuf + 40),
          mtime: readI53FromI64(statBuf + 56),
          ctime: readI53FromI64(statBuf + 72),
          ino: readI53FromU64(statBuf + 88),
        };
      },
      stat(path) {
        var statBuf = _malloc(96);
        FS.handleError(
          withStackSave(() => __wasmfs_stat(stringToUTF8OnStack(path), statBuf))
        );
        var stats = FS.statBufToObject(statBuf);
        _free(statBuf);
        return stats;
      },
      lstat(path) {
        var statBuf = _malloc(96);
        FS.handleError(
          withStackSave(() =>
            __wasmfs_lstat(stringToUTF8OnStack(path), statBuf)
          )
        );
        var stats = FS.statBufToObject(statBuf);
        _free(statBuf);
        return stats;
      },
      chmod(path, mode) {
        return FS.handleError(
          withStackSave(() => {
            var buffer = stringToUTF8OnStack(path);
            return __wasmfs_chmod(buffer, mode);
          })
        );
      },
      lchmod(path, mode) {
        return FS.handleError(
          withStackSave(() => {
            var buffer = stringToUTF8OnStack(path);
            return __wasmfs_lchmod(buffer, mode);
          })
        );
      },
      fchmod(fd, mode) {
        return FS.handleError(__wasmfs_fchmod(fd, mode));
      },
      utime: (path, atime, mtime) =>
        FS.handleError(
          withStackSave(() =>
            __wasmfs_utime(stringToUTF8OnStack(path), atime, mtime)
          )
        ),
      truncate(path, len) {
        return FS.handleError(
          withStackSave(() =>
            __wasmfs_truncate(
              stringToUTF8OnStack(path),
              len >>> 0,
              ((tempDouble = len),
              +Math.abs(tempDouble) >= 1
                ? tempDouble > 0
                  ? +Math.floor(tempDouble / 4294967296) >>> 0
                  : ~~+Math.ceil(
                      (tempDouble - +(~~tempDouble >>> 0)) / 4294967296
                    ) >>> 0
                : 0)
            )
          )
        );
      },
      ftruncate(fd, len) {
        return FS.handleError(
          __wasmfs_ftruncate(
            fd,
            len >>> 0,
            ((tempDouble = len),
            +Math.abs(tempDouble) >= 1
              ? tempDouble > 0
                ? +Math.floor(tempDouble / 4294967296) >>> 0
                : ~~+Math.ceil(
                    (tempDouble - +(~~tempDouble >>> 0)) / 4294967296
                  ) >>> 0
              : 0)
          )
        );
      },
      findObject(path) {
        var result = withStackSave(() =>
          __wasmfs_identify(stringToUTF8OnStack(path))
        );
        if (result == 44) {
          return null;
        }
        return { isFolder: result == 31, isDevice: false };
      },
      readdir: (path) =>
        withStackSave(() => {
          var pathBuffer = stringToUTF8OnStack(path);
          var entries = [];
          var state = __wasmfs_readdir_start(pathBuffer);
          if (!state) {
            throw new Error("No such directory");
          }
          var entry;
          while ((entry = __wasmfs_readdir_get(state))) {
            entries.push(UTF8ToString(entry));
          }
          __wasmfs_readdir_finish(state);
          return entries;
        }),
      mount: (type, opts, mountpoint) => {
        var backendPointer = type.createBackend(opts);
        return FS.handleError(
          withStackSave(() =>
            __wasmfs_mount(stringToUTF8OnStack(mountpoint), backendPointer)
          )
        );
      },
      unmount: (mountpoint) =>
        FS.handleError(
          withStackSave(() => __wasmfs_unmount(stringToUTF8OnStack(mountpoint)))
        ),
      mknod: (path, mode, dev) => FS_mknod(path, mode, dev),
      makedev: (ma, mi) => (ma << 8) | mi,
      registerDevice(dev, ops) {
        var backendPointer = _wasmfs_create_jsimpl_backend();
        var definedOps = {
          userRead: ops.read,
          userWrite: ops.write,
          allocFile: (file) => {
            wasmFSDeviceStreams[file] = {};
          },
          freeFile: (file) => {
            wasmFSDeviceStreams[file] = undefined;
          },
          getSize: (file) => {},
          setSize: (file, size) => 0,
          read: (file, buffer, length, offset) => {
            var bufferArray = Module.HEAP8.subarray(buffer, buffer + length);
            try {
              var bytesRead = definedOps.userRead(
                wasmFSDeviceStreams[file],
                bufferArray,
                0,
                length,
                offset
              );
            } catch (e) {
              return -e.errno;
            }
            Module.HEAP8.set(bufferArray, buffer);
            return bytesRead;
          },
          write: (file, buffer, length, offset) => {
            var bufferArray = Module.HEAP8.subarray(buffer, buffer + length);
            try {
              var bytesWritten = definedOps.userWrite(
                wasmFSDeviceStreams[file],
                bufferArray,
                0,
                length,
                offset
              );
            } catch (e) {
              return -e.errno;
            }
            Module.HEAP8.set(bufferArray, buffer);
            return bytesWritten;
          },
        };
        wasmFS$backends[backendPointer] = definedOps;
        wasmFSDevices[dev] = backendPointer;
      },
      createDevice(parent, name, input, output) {
        if (typeof parent != "string") {
          throw new Error("Only string paths are accepted");
        }
        var path = PATH.join2(parent, name);
        var mode = FS_getMode(!!input, !!output);
        FS.createDevice.major ??= 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        FS.registerDevice(dev, {
          read(stream, buffer, offset, length, pos) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset + i] = result;
            }
            return bytesRead;
          },
          write(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset + i]);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
            }
            return i;
          },
        });
        return FS.mkdev(path, mode, dev);
      },
      mkdev(path, mode, dev) {
        if (typeof dev === "undefined") {
          dev = mode;
          mode = 438;
        }
        var deviceBackend = wasmFSDevices[dev];
        if (!deviceBackend) {
          throw new Error("Invalid device ID.");
        }
        return FS.handleError(
          withStackSave(() =>
            _wasmfs_create_file(stringToUTF8OnStack(path), mode, deviceBackend)
          )
        );
      },
      rename(oldPath, newPath) {
        return FS.handleError(
          withStackSave(() => {
            var oldPathBuffer = stringToUTF8OnStack(oldPath);
            var newPathBuffer = stringToUTF8OnStack(newPath);
            return __wasmfs_rename(oldPathBuffer, newPathBuffer);
          })
        );
      },
      llseek(stream, offset, whence) {
        return FS.handleError(
          __wasmfs_llseek(
            stream.fd,
            offset >>> 0,
            ((tempDouble = offset),
            +Math.abs(tempDouble) >= 1
              ? tempDouble > 0
                ? +Math.floor(tempDouble / 4294967296) >>> 0
                : ~~+Math.ceil(
                    (tempDouble - +(~~tempDouble >>> 0)) / 4294967296
                  ) >>> 0
              : 0),
            whence
          )
        );
      },
    };
    var FS_createPath = FS.createPath;
    PThread.init();
    embind_init_charCodes();
    BindingError = Module["BindingError"] = class BindingError extends Error {
      constructor(message) {
        super(message);
        this.name = "BindingError";
      }
    };
    InternalError = Module["InternalError"] = class InternalError extends (
      Error
    ) {
      constructor(message) {
        super(message);
        this.name = "InternalError";
      }
    };
    init_ClassHandle();
    init_embind();
    init_RegisteredPointer();
    UnboundTypeError = Module["UnboundTypeError"] = extendError(
      Error,
      "UnboundTypeError"
    );
    init_emval();
    Module["requestAnimationFrame"] = MainLoop.requestAnimationFrame;
    Module["pauseMainLoop"] = MainLoop.pause;
    Module["resumeMainLoop"] = MainLoop.resume;
    MainLoop.init();
    FS.init();
    var proxiedFunctionTable = [
      _proc_exit,
      exitOnMainThread,
      pthreadCreateProxied,
      __setitimer_js,
      _environ_get,
      _environ_sizes_get,
      _getaddrinfo,
    ];
    var wasmImports;
    function assignWasmImports() {
      wasmImports = {
        $: _JS_addAlertOnError,
        i: _JS_alert,
        J: _JS_getMicAccess,
        ja: _JS_onReceived,
        ua: _JS_pd4webCppClass,
        h: _JS_post,
        v: _JS_receiveBang,
        u: _JS_receiveFloat,
        ra: _JS_receiveList,
        qa: _JS_receiveMessage,
        sa: _JS_receiveSymbol,
        ta: _JS_sendList,
        l: _JS_suspendAudioWorkLet,
        R: ___call_sighandler,
        k: ___cxa_throw,
        V: ___pthread_create_js,
        da: __abort_js,
        A: __embind_register_bigint,
        ga: __embind_register_bool,
        ka: __embind_register_class,
        ia: __embind_register_class_constructor,
        b: __embind_register_class_function,
        fa: __embind_register_emval,
        r: __embind_register_float,
        e: __embind_register_integer,
        d: __embind_register_memory_view,
        s: __embind_register_std_string,
        j: __embind_register_std_wstring,
        ha: __embind_register_void,
        Z: __emscripten_init_main_thread_js,
        Q: __emscripten_notify_mailbox_postmessage,
        W: __emscripten_receive_on_main_thread_js,
        S: __emscripten_runtime_keepalive_clear,
        n: __emscripten_thread_cleanup,
        Y: __emscripten_thread_mailbox_await,
        aa: __emscripten_thread_set_strongref,
        z: __localtime_js,
        T: __setitimer_js,
        X: __tzset_js,
        K: __wasmfs_copy_preloaded_file_data,
        H: __wasmfs_get_num_preloaded_dirs,
        I: __wasmfs_get_num_preloaded_files,
        F: __wasmfs_get_preloaded_child_path,
        D: __wasmfs_get_preloaded_file_mode,
        L: __wasmfs_get_preloaded_file_size,
        G: __wasmfs_get_preloaded_parent_path,
        E: __wasmfs_get_preloaded_path_name,
        C: __wasmfs_jsimpl_alloc_file,
        m: __wasmfs_jsimpl_free_file,
        B: __wasmfs_jsimpl_get_size,
        y: __wasmfs_jsimpl_read,
        w: __wasmfs_jsimpl_set_size,
        x: __wasmfs_jsimpl_write,
        O: __wasmfs_stdin_get_char,
        o: _emscripten_check_blocking_allowed,
        na: _emscripten_create_audio_context,
        pa: _emscripten_create_wasm_audio_worklet_node,
        oa: _emscripten_create_wasm_audio_worklet_processor_async,
        c: _emscripten_date_now,
        f: _emscripten_err,
        _: _emscripten_exit_with_live_runtime,
        g: _emscripten_get_now,
        N: _emscripten_out,
        P: _emscripten_resize_heap,
        t: _emscripten_resume_audio_context_sync,
        la: _emscripten_set_main_loop,
        ma: _emscripten_start_wasm_audio_worklet_thread_async,
        U: _emscripten_unwind_to_js_event_loop,
        ba: _environ_get,
        ca: _environ_sizes_get,
        p: _exit,
        q: _getaddrinfo,
        M: _getentropy,
        a: wasmMemory,
        ea: _proc_exit,
      };
    }
    var wasmExports = createWasm();
    var ___wasm_call_ctors = () => (___wasm_call_ctors = wasmExports["va"])();
    var _main = (Module["_main"] = (a0, a1) =>
      (_main = Module["_main"] = wasmExports["wa"])(a0, a1));
    var _malloc = (a0) => (_malloc = wasmExports["xa"])(a0);
    var ___getTypeName = (a0) => (___getTypeName = wasmExports["ya"])(a0);
    var __embind_initialize_bindings = () =>
      (__embind_initialize_bindings = wasmExports["za"])();
    var _pthread_self = () => (_pthread_self = wasmExports["Aa"])();
    var _free = (a0) => (_free = wasmExports["Ba"])(a0);
    var _ntohs = (a0) => (_ntohs = wasmExports["Ca"])(a0);
    var _htons = (a0) => (_htons = wasmExports["Da"])(a0);
    var __emscripten_tls_init = () =>
      (__emscripten_tls_init = wasmExports["Ea"])();
    var __emscripten_thread_init = (a0, a1, a2, a3, a4, a5) =>
      (__emscripten_thread_init = wasmExports["Ga"])(a0, a1, a2, a3, a4, a5);
    var ___set_thread_state = (a0, a1, a2, a3) =>
      (___set_thread_state = wasmExports["Ha"])(a0, a1, a2, a3);
    var __emscripten_thread_crashed = () =>
      (__emscripten_thread_crashed = wasmExports["Ia"])();
    var _htonl = (a0) => (_htonl = wasmExports["Ja"])(a0);
    var __emscripten_run_on_main_thread_js = (a0, a1, a2, a3, a4) =>
      (__emscripten_run_on_main_thread_js = wasmExports["Ka"])(
        a0,
        a1,
        a2,
        a3,
        a4
      );
    var __emscripten_thread_free_data = (a0) =>
      (__emscripten_thread_free_data = wasmExports["La"])(a0);
    var __emscripten_thread_exit = (a0) =>
      (__emscripten_thread_exit = wasmExports["Ma"])(a0);
    var __emscripten_timeout = (a0, a1) =>
      (__emscripten_timeout = wasmExports["Na"])(a0, a1);
    var __emscripten_check_mailbox = () =>
      (__emscripten_check_mailbox = wasmExports["Oa"])();
    var _emscripten_stack_set_limits = (a0, a1) =>
      (_emscripten_stack_set_limits = wasmExports["Pa"])(a0, a1);
    var __emscripten_wasm_worker_initialize = (a0, a1) =>
      (__emscripten_wasm_worker_initialize = wasmExports["Qa"])(a0, a1);
    var __emscripten_stack_restore = (a0) =>
      (__emscripten_stack_restore = wasmExports["Ra"])(a0);
    var __emscripten_stack_alloc = (a0) =>
      (__emscripten_stack_alloc = wasmExports["Sa"])(a0);
    var _emscripten_stack_get_current = () =>
      (_emscripten_stack_get_current = wasmExports["Ta"])();
    var __wasmfs_read_file = (a0) =>
      (__wasmfs_read_file = wasmExports["Ua"])(a0);
    var __wasmfs_write_file = (a0, a1, a2) =>
      (__wasmfs_write_file = wasmExports["Va"])(a0, a1, a2);
    var __wasmfs_mkdir = (a0, a1) =>
      (__wasmfs_mkdir = wasmExports["Wa"])(a0, a1);
    var __wasmfs_rmdir = (a0) => (__wasmfs_rmdir = wasmExports["Xa"])(a0);
    var __wasmfs_open = (a0, a1, a2) =>
      (__wasmfs_open = wasmExports["Ya"])(a0, a1, a2);
    var __wasmfs_allocate = (a0, a1, a2, a3, a4) =>
      (__wasmfs_allocate = wasmExports["Za"])(a0, a1, a2, a3, a4);
    var __wasmfs_mknod = (a0, a1, a2) =>
      (__wasmfs_mknod = wasmExports["_a"])(a0, a1, a2);
    var __wasmfs_unlink = (a0) => (__wasmfs_unlink = wasmExports["$a"])(a0);
    var __wasmfs_chdir = (a0) => (__wasmfs_chdir = wasmExports["ab"])(a0);
    var __wasmfs_symlink = (a0, a1) =>
      (__wasmfs_symlink = wasmExports["bb"])(a0, a1);
    var __wasmfs_readlink = (a0) => (__wasmfs_readlink = wasmExports["cb"])(a0);
    var __wasmfs_write = (a0, a1, a2) =>
      (__wasmfs_write = wasmExports["db"])(a0, a1, a2);
    var __wasmfs_pwrite = (a0, a1, a2, a3, a4) =>
      (__wasmfs_pwrite = wasmExports["eb"])(a0, a1, a2, a3, a4);
    var __wasmfs_chmod = (a0, a1) =>
      (__wasmfs_chmod = wasmExports["fb"])(a0, a1);
    var __wasmfs_fchmod = (a0, a1) =>
      (__wasmfs_fchmod = wasmExports["gb"])(a0, a1);
    var __wasmfs_lchmod = (a0, a1) =>
      (__wasmfs_lchmod = wasmExports["hb"])(a0, a1);
    var __wasmfs_llseek = (a0, a1, a2, a3) =>
      (__wasmfs_llseek = wasmExports["ib"])(a0, a1, a2, a3);
    var __wasmfs_rename = (a0, a1) =>
      (__wasmfs_rename = wasmExports["jb"])(a0, a1);
    var __wasmfs_read = (a0, a1, a2) =>
      (__wasmfs_read = wasmExports["kb"])(a0, a1, a2);
    var __wasmfs_pread = (a0, a1, a2, a3, a4) =>
      (__wasmfs_pread = wasmExports["lb"])(a0, a1, a2, a3, a4);
    var __wasmfs_truncate = (a0, a1, a2) =>
      (__wasmfs_truncate = wasmExports["mb"])(a0, a1, a2);
    var __wasmfs_ftruncate = (a0, a1, a2) =>
      (__wasmfs_ftruncate = wasmExports["nb"])(a0, a1, a2);
    var __wasmfs_close = (a0) => (__wasmfs_close = wasmExports["ob"])(a0);
    var __wasmfs_mmap = (a0, a1, a2, a3, a4, a5) =>
      (__wasmfs_mmap = wasmExports["pb"])(a0, a1, a2, a3, a4, a5);
    var __wasmfs_msync = (a0, a1, a2) =>
      (__wasmfs_msync = wasmExports["qb"])(a0, a1, a2);
    var __wasmfs_munmap = (a0, a1) =>
      (__wasmfs_munmap = wasmExports["rb"])(a0, a1);
    var __wasmfs_utime = (a0, a1, a2) =>
      (__wasmfs_utime = wasmExports["sb"])(a0, a1, a2);
    var __wasmfs_stat = (a0, a1) => (__wasmfs_stat = wasmExports["tb"])(a0, a1);
    var __wasmfs_lstat = (a0, a1) =>
      (__wasmfs_lstat = wasmExports["ub"])(a0, a1);
    var __wasmfs_mount = (a0, a1) =>
      (__wasmfs_mount = wasmExports["vb"])(a0, a1);
    var __wasmfs_unmount = (a0) => (__wasmfs_unmount = wasmExports["wb"])(a0);
    var __wasmfs_identify = (a0) => (__wasmfs_identify = wasmExports["xb"])(a0);
    var __wasmfs_readdir_start = (a0) =>
      (__wasmfs_readdir_start = wasmExports["yb"])(a0);
    var __wasmfs_readdir_get = (a0) =>
      (__wasmfs_readdir_get = wasmExports["zb"])(a0);
    var __wasmfs_readdir_finish = (a0) =>
      (__wasmfs_readdir_finish = wasmExports["Ab"])(a0);
    var __wasmfs_get_cwd = () => (__wasmfs_get_cwd = wasmExports["Bb"])();
    var _wasmfs_create_jsimpl_backend = () =>
      (_wasmfs_create_jsimpl_backend = wasmExports["Cb"])();
    var _wasmfs_create_file = (a0, a1, a2) =>
      (_wasmfs_create_file = wasmExports["Db"])(a0, a1, a2);
    var dynCall_jiji = (Module["dynCall_jiji"] = (a0, a1, a2, a3, a4) =>
      (dynCall_jiji = Module["dynCall_jiji"] = wasmExports["Eb"])(
        a0,
        a1,
        a2,
        a3,
        a4
      ));
    var dynCall_ji = (Module["dynCall_ji"] = (a0, a1) =>
      (dynCall_ji = Module["dynCall_ji"] = wasmExports["Fb"])(a0, a1));
    var dynCall_iiiij = (Module["dynCall_iiiij"] = (a0, a1, a2, a3, a4, a5) =>
      (dynCall_iiiij = Module["dynCall_iiiij"] = wasmExports["Gb"])(
        a0,
        a1,
        a2,
        a3,
        a4,
        a5
      ));
    var dynCall_iij = (Module["dynCall_iij"] = (a0, a1, a2, a3) =>
      (dynCall_iij = Module["dynCall_iij"] = wasmExports["Hb"])(
        a0,
        a1,
        a2,
        a3
      ));
    Module["addRunDependency"] = addRunDependency;
    Module["removeRunDependency"] = removeRunDependency;
    Module["stackSave"] = stackSave;
    Module["stackRestore"] = stackRestore;
    Module["stackAlloc"] = stackAlloc;
    Module["wasmTable"] = wasmTable;
    Module["FS_createPreloadedFile"] = FS_createPreloadedFile;
    Module["FS_unlink"] = FS_unlink;
    Module["FS_createPath"] = FS_createPath;
    Module["FS_createDataFile"] = FS_createDataFile;
    var calledRun;
    dependenciesFulfilled = function runCaller() {
      if (!calledRun) run();
      if (!calledRun) dependenciesFulfilled = runCaller;
    };
    function callMain() {
      var entryFunction = _main;
      var argc = 0;
      var argv = 0;
      try {
        var ret = entryFunction(argc, argv);
        exitJS(ret, true);
        return ret;
      } catch (e) {
        return handleException(e);
      }
    }
    function run() {
      if (runDependencies > 0) {
        return;
      }
      if (ENVIRONMENT_IS_WASM_WORKER) {
        readyPromiseResolve(Module);
        return initRuntime();
      }
      if (ENVIRONMENT_IS_PTHREAD) {
        readyPromiseResolve(Module);
        initRuntime();
        startWorker(Module);
        return;
      }
      preRun();
      if (runDependencies > 0) {
        return;
      }
      function doRun() {
        if (calledRun) return;
        calledRun = true;
        Module["calledRun"] = true;
        if (ABORT) return;
        initRuntime();
        preMain();
        readyPromiseResolve(Module);
        Module["onRuntimeInitialized"]?.();
        if (shouldRunNow) callMain();
        postRun();
      }
      if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(() => {
          setTimeout(() => Module["setStatus"](""), 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function")
        Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].pop()();
      }
    }
    var shouldRunNow = true;
    if (Module["noInitialRun"]) shouldRunNow = false;
    run();
    moduleRtn = readyPromise;

    return moduleRtn;
  };
})();
globalThis.AudioWorkletModule = Pd4WebModule;
if (typeof exports === "object" && typeof module === "object")
  module.exports = Pd4WebModule;
else if (typeof define === "function" && define["amd"])
  define([], () => Pd4WebModule);
var isPthread = globalThis.self?.name === "em-pthread";
var isNode = typeof globalThis.process?.versions?.node == "string";
if (isNode) isPthread = require("worker_threads").workerData === "em-pthread";

// When running as a pthread, construct a new instance on startup
isPthread && Pd4WebModule();
