/**
 * CSInterface - Minimal wrapper for Adobe CEP communication
 * Based on Adobe CEP SDK (Apache 2.0 License)
 */

var SystemPath = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension",
    HOST_APPLICATION: "hostApplication"
};

function CSInterface() {}

CSInterface.prototype.getSystemPath = function(pathType) {
    var path = "";
    var ppInfo;
    try {
        ppInfo = window.__adobe_cep__.getSystemPath(pathType);
        path = decodeURI(ppInfo);
    } catch (e) {
        return "";
    }

    var osInfo = this.getOSInformation();
    if (osInfo && osInfo.indexOf("Windows") >= 0) {
        path = path.replace("file:///", "");
    } else if (osInfo && (osInfo.indexOf("Mac") >= 0 || osInfo.indexOf("darwin") >= 0)) {
        path = path.replace("file://", "");
    } else {
        path = path.replace("file://", "");
    }
    return path;
};

CSInterface.prototype.evalScript = function(script, callback) {
    if (callback === null || callback === undefined) {
        callback = function() {};
    }
    try {
        window.__adobe_cep__.evalScript(script, callback);
    } catch (e) {
        callback('{"error":"CSInterface not available - running outside Adobe host."}');
    }
};

CSInterface.prototype.getOSInformation = function() {
    try {
        return window.__adobe_cep__.getOSInformation();
    } catch (e) {
        return window.navigator.platform;
    }
};

CSInterface.prototype.getHostEnvironment = function() {
    try {
        return JSON.parse(window.__adobe_cep__.getHostEnvironment());
    } catch (e) {
        return { appName: "Unknown", appVersion: "0.0" };
    }
};

CSInterface.prototype.addEventListener = function(type, listener, obj) {
    try {
        window.__adobe_cep__.addEventListener(type, listener, obj);
    } catch (e) {}
};

CSInterface.prototype.removeEventListener = function(type, listener, obj) {
    try {
        window.__adobe_cep__.removeEventListener(type, listener, obj);
    } catch (e) {}
};

CSInterface.prototype.closeExtension = function() {
    try {
        window.__adobe_cep__.closeExtension();
    } catch (e) {}
};
