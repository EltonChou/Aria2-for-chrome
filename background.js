const defaultRPC = '[{"name":"ARIA2 RPC","url":"http://localhost:6800/jsonrpc", "pattern": ""}]';
var CurrentTabUrl = "about:blank";
var MonitorId = -1;
var MonitorRate = 3000;
const fetchRpcList = () => JSON.parse(localStorage.getItem("rpc_list") || defaultRPC)
var HttpSendRead = function(info) {
    Promise.prototype.done = Promise.prototype.then;
    Promise.prototype.fail = Promise.prototype.catch;
    return new Promise(function(resolve, reject) {
        var http = new XMLHttpRequest();
        var contentType = "application/x-www-form-urlencoded; charset=UTF-8";
        var timeout = 3000;
        if (info.contentType != null) {
            contentType = info.contentType;
        }
        if (info.timeout != null) {
            timeout = info.timeout;
        }
        var timeId = setTimeout(httpclose, timeout);
        function httpclose() {
            http.abort();
        }
        http.onreadystatechange = function() {
            if (http.readyState == 4) {
                if ((http.status == 200 && http.status < 300) || http.status == 304) {
                    clearTimeout(timeId);
                    if (info.dataType == "json") {
                        resolve(JSON.parse(http.responseText), http.status, http);
                    } else if (info.dataType == "SCRIPT") {
                        // eval(http.responseText);
                        resolve(http.responseText, http.status, http);
                    }
                } else {
                    clearTimeout(timeId);
                    reject(http, http.statusText, http.status);
                }
            }
        }
        http.open(info.type, info.url, true);
        http.setRequestHeader("Content-type", contentType);
        for (h in info.headers) {
            if (info.headers[h]) {
                http.setRequestHeader(h, info.headers[h]);
            }
        }
        if (info.type == "POST") {
            http.send(info.data);
        } else {
            http.send();
        }
    }
    );
};

//弹出chrome通知
function showNotification(id, opt) {
    var notification = chrome.notifications.create(id, opt, function(notifyId) {
        return notifyId
    });
}
//解析RPC地址
function parse_url(url) {
    var auth_str = request_auth(url);
    var auth = null;
    if (auth_str) {
        if (auth_str.indexOf('token:') == 0) {
            auth = auth_str;
        } else {
            auth = "Basic " + btoa(auth_str);
        }
    }
    var url_path = remove_auth(url);
    function request_auth(url) {
        return url.match(/^(?:(?![^:@]+:[^:@\/]*@)[^:\/?#.]+:)?(?:\/\/)?(?:([^:@]*(?::[^:@]*)?)?@)?/)[1];
    }
    function remove_auth(url) {
        return url.replace(/^((?![^:@]+:[^:@\/]*@)[^:\/?#.]+:)?(\/\/)?(?:(?:[^:@]*(?::[^:@]*)?)?@)?(.*)/, '$1$2$3');
    }
    return [url_path, auth];
}

function aria2Send(link, rpcUrl, downloadItem) {
    chrome.cookies.getAll({
        "url": link
    }, function(cookies) {
        var format_cookies = [];
        for (var i in cookies) {
            var cookie = cookies[i];
            format_cookies.push(cookie.name + "=" + cookie.value);
        }
        var header = [];
        header.push("Cookie: " + format_cookies.join("; "));
        header.push("User-Agent: " + navigator.userAgent);
        header.push("Connection: keep-alive");

        var options = {
                "header": header,
                "referer": downloadItem.referrer,
                "out": downloadItem.filename
        };
        if(downloadItem.hasOwnProperty('options')){
            options = Object.assign(options, downloadItem.options);
        }

        var rpc_data = {
            "jsonrpc": "2.0",
            "method": "aria2.addUri",
            "id": new Date().getTime(),
            "params": [[link], options]
        };
        var result = parse_url(rpcUrl);
        var auth = result[1];
        if (auth && auth.indexOf('token:') == 0) {
            rpc_data.params.unshift(auth);
        }

        var parameter = {
            'url': result[0],
            'dataType': 'json',
            type: 'POST',
            data: JSON.stringify(rpc_data),
            'headers': {
                'Authorization': auth
            }
        };
        HttpSendRead(parameter).done(function(json, textStatus, jqXHR) {
            var title = chrome.i18n.getMessage("exportSucceedStr");
            var des = chrome.i18n.getMessage("exportSucceedDes");
            var opt = {
                type: "basic",
                title: title,
                message: des,
                iconUrl: "images/logo64.png",
                isClickable: true
            }
            var id = new Date().getTime().toString();
            showNotification(id, opt);
        }).fail(function(jqXHR, textStatus, errorThrown) {
            console.log(jqXHR);
            var title = chrome.i18n.getMessage("exportFailedStr");
            var des = chrome.i18n.getMessage("exportFailedDes");
            var opt = {
                type: "basic",
                title: title,
                message: des,
                iconUrl: "images/logo64.png",
                requireInteraction: false
            }
            var id = new Date().getTime().toString();
            showNotification(id, opt);
        });
    });

}

function getRpcUrl(url, rpc_list) {
    for (var i = 1; i < rpc_list.length; i++) {
      var patterns = rpc_list[i]['pattern'].split(',');
      for (var j in patterns) {
        var pattern = patterns[j].trim();
        if (matchRule(url, pattern)) {
          return rpc_list[i]['url'];
        }
      }
    }
    return rpc_list[0]['url'];
}

function matchRule(str, rule) {
    return new RegExp("^" + rule.split("*").join(".*") + "$").test(str);
}

function isCapture(downloadItem) {
    var fileSize = localStorage.getItem("fileSize");
    var whiteSiteList = JSON.parse(localStorage.getItem("white_site"));
    var blackSiteList = JSON.parse(localStorage.getItem("black_site"));
    var whiteExtList = JSON.parse(localStorage.getItem("white_ext"));
    var blackExtList = JSON.parse(localStorage.getItem("black_ext"));
    var currentTabUrl = new URL(CurrentTabUrl);
    var url = new URL(downloadItem.referrer || downloadItem.url);

    if (downloadItem.error || downloadItem.state != "in_progress" || !downloadItem.finalUrl.startsWith("http")) {
        return false;
    }

    for (var i in whiteSiteList) {
        if (matchRule(currentTabUrl.hostname, whiteSiteList[i]) || matchRule(url.hostname, whiteSiteList[i])) {
            return true;
        }
    }
    for (var i in blackSiteList) {
        if (matchRule(currentTabUrl.hostname, blackSiteList[i]) || matchRule(url.hostname, blackSiteList[i])) {
            return false;
        }
    }

    for (var i in whiteExtList) {
        if (downloadItem.filename.endsWith(whiteExtList[i])) {
            return true;
        }
    }
    for (var i in blackExtList) {
        if (downloadItem.filename.endsWith(blackExtList[i])) {
            return false;
        }
    }

    if (downloadItem.fileSize >= fileSize * 1024 * 1024) {
        return true;
    } else {
        return false;
    }
}

function isCaptureFinalUrl() {
    var finalUrl = localStorage.getItem("finalUrl");
    return finalUrl == "true";

}

function enableCapture() {
    chrome.downloads.onDeterminingFilename.addListener(captureDownload);
    chrome.browserAction.setIcon({
        path: {
            '32': "images/logo32.png",
            '64': "images/logo64.png",
            '128': "images/logo128.png",
            '256': "images/logo256.png"
        }
    });
    localStorage.setItem("integration", true);
    chrome.contextMenus.update("captureDownload", { checked: true });
}

function disableCapture() {
    if (chrome.downloads.onDeterminingFilename.hasListener(captureDownload)) {
        chrome.downloads.onDeterminingFilename.removeListener(captureDownload);
    }
    chrome.browserAction.setIcon({
        path: {
            '32': "images/logo32-gray.png",
            '64': "images/logo64-gray.png",
            '128': "images/logo128-gray.png",
            '256': "images/logo256-gray.png"
        }
    });
    localStorage.setItem("integration", false);
    chrome.contextMenus.update("captureDownload", { checked: false });
}

function captureDownload(downloadItem, suggestion) {

    var askBeforeDownload = localStorage.getItem("askBeforeDownload");
    var integration = localStorage.getItem("integration");
    if (downloadItem.byExtensionId == "gbdinbbamaniaidalikeiclecfbpgphh") {
        //workaround for filename ignorant assigned by extension "音视频下载"
        return true;
    }
    suggestion();
    if (integration == "true" && isCapture(downloadItem)) {
        chrome.downloads.cancel(downloadItem.id);
        if (askBeforeDownload == "true") {
            if (isCaptureFinalUrl()) {
                launchUI(downloadItem.finalUrl, downloadItem.referrer);
            } else {
                launchUI(downloadItem.url, downloadItem.referrer);
            }
        } else {
            var rpc_list = JSON.parse(localStorage.getItem("rpc_list") || defaultRPC);
            if (isCaptureFinalUrl()) {
                var rpc_url = getRpcUrl(downloadItem.finalUrl, rpc_list);
                aria2Send(downloadItem.finalUrl, rpc_url, downloadItem);
            } else {
                var rpc_url = getRpcUrl(downloadItem.url, rpc_list);
                aria2Send(downloadItem.url, rpc_url, downloadItem);
            }
        }
    }

}

chrome.browserAction.onClicked.addListener(launchUI);

function launchUI(downloadURL, referrer) {
    var index = chrome.extension.getURL('ui/ariang/index.html');
    if (typeof downloadURL === "string") {
        url = index + "#!/new?url=" + btoa(downloadURL);
        if (typeof referrer === "string" && referrer != "") {
            url = url + "&referer=" + referrer;
        }
    } else {
        url = index;
        //clicked from notification or sbrowserAction icon, only launch UI.
    }
    chrome.tabs.query({ "url": index }, function (tabs) {
        for (var i in tabs) {
            chrome.windows.update(tabs[i].windowId, {
                focused: true
            });
            chrome.tabs.update(tabs[i].id, {
                selected: true,
                url: url
            });
            return;
        }
        var webUIOpenStyle = localStorage.getItem("webUIOpenStyle") || "newtab";
        if (webUIOpenStyle == "newwindow") {
            openInWindow(url);
        } else if (webUIOpenStyle == "newtab") {
            chrome.tabs.create({
                url: url
            });
        }
    });
}

function openInWindow(url) {
    var w = 1280, h = 720;
    var left = (screen.width / 2) - (w / 2);
    var top = (screen.height / 2) - (h / 2);

    chrome.windows.create({
        url: url,
        width: w,
        height: h,
        'left': left,
        'top': top,
        type: 'popup',
        focused: false
    }, function (window) {
        chrome.windows.update(window.id, {
            focused: true
        });
    });
}

function createOptionMenu() {
    var strDownloadCapture = chrome.i18n.getMessage("downloadCaptureStr");
    var isCaptureDownload =localStorage.getItem("integration") == "true";
    chrome.contextMenus.create({
        "type": "checkbox",
        "checked":isCaptureDownload,
        "id": "captureDownload",
        "title": strDownloadCapture,
        "contexts": ["browser_action"]
    });
    var strMonitorAria2 = chrome.i18n.getMessage("monitorAria2Str");
    var isMonitorAria2 =localStorage.getItem("monitorAria2") == "true";
    chrome.contextMenus.create({
        "type": "checkbox",
        "checked": isMonitorAria2,
        "id": "monitorAria2",
        "title": strMonitorAria2,
        "contexts": ["browser_action"]
    });
    chrome.contextMenus.create({
        "type": "separator",
        "id": "separator",
        "contexts": ["browser_action"]
    });
    var strOpenWebUI = chrome.i18n.getMessage("openWebUIStr");
    chrome.contextMenus.create({
        "type": "normal",
        "id": "openWebUI",
        "title": strOpenWebUI,
        "contexts": ["browser_action"]
    });
    var strAddtoWhiteList = chrome.i18n.getMessage("addToWhiteListStr");
    chrome.contextMenus.create({
        "type": "normal",
        "id": "updateWhiteSite",
        "title": strAddtoWhiteList,
        "contexts": ["browser_action"]
    });
    var strAddtoBlackList = chrome.i18n.getMessage("addToBlackListStr");
    chrome.contextMenus.create({
        "type": "normal",
        "id": "updateBlackSite",
        "title": strAddtoBlackList,
        "contexts": ["browser_action"]
    });

}

//add Context Menu
function addContextMenu(id, title) {
    chrome.contextMenus.create({
        id: id,
        title: title,
        contexts: ['link', 'selection']
    });
}

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    var strExport = chrome.i18n.getMessage("contextmenuTitle");
    if (changeInfo.status === 'loading') {
        chrome.contextMenus.removeAll();
        createOptionMenu();
        updateOptionMenu(tab);
        var contextMenus = localStorage.getItem("contextMenus");
        if (contextMenus == "true" || contextMenus == null) {
            var rpc_list = JSON.parse(localStorage.getItem("rpc_list") || defaultRPC);
            for (var i in rpc_list) {
                addContextMenu(rpc_list[i]['url'], strExport + rpc_list[i]['name']);
            }
            localStorage.setItem("contextMenus", true);
        }
    }
    CurrentTabUrl = tab.url || "about:blank";

});

chrome.tabs.onActivated.addListener(function(activeInfo) {
    chrome.tabs.get(activeInfo.tabId, function(tab) {
        updateOptionMenu(tab);
        CurrentTabUrl = tab.url || "about:blank";
    });

});

chrome.windows.onFocusChanged.addListener(function(windowId) {
    chrome.tabs.query({ windowId: windowId, active: true }, function(tabs) {
        if (tabs.length > 0) {
            CurrentTabUrl = tabs[0].url || "about:blank";
            updateOptionMenu(tabs[0]);
        }
    });
})

chrome.contextMenus.onClicked.addListener(function(info, tab) {
    var uri = decodeURIComponent(info.linkUrl || info.selectionText);
    var referrer = info.frameUrl || info.pageUrl;
    // mock a DownloadItem
    var downloadItem = {
        url: uri,
        referrer: referrer,
        filename: ""
    };

    if (info.menuItemId == "openWebUI") {
        launchUI();
    } else if (info.menuItemId == "captureDownload") {
        if (info.checked) {
            enableCapture();
        } else {
            disableCapture();
        }
    } else if (info.menuItemId == "monitorAria2") {
        if (info.checked) {
            enableMonitor();
        } else {
            disableMonitor();
        }
    } else if (info.menuItemId == "updateBlackSite") {
        updateBlackSite(tab);
        updateOptionMenu(tab);
    } else if (info.menuItemId == "updateWhiteSite") {
        updateWhiteSite(tab);
        updateOptionMenu(tab);
    } else {
        aria2Send(uri, info.menuItemId, downloadItem);
    }
});

function updateOptionMenu(tab) {
    var black_site = JSON.parse(localStorage.getItem("black_site"));
    var black_site_set = new Set(black_site);
    var white_site = JSON.parse(localStorage.getItem("white_site"));
    var white_site_set = new Set(white_site);
    if (tab == null || tab.url == null) {
        console.warn("Could not get active tab url, update option menu failed.");
    }
    if (!tab.active || !tab.url.startsWith("http"))
        return;
    var url = new URL(tab.url);
    if (black_site_set.has(url.hostname)) {
        var updateBlackSiteStr = chrome.i18n.getMessage("removeFromBlackListStr");
        chrome.contextMenus.update("updateBlackSite", {
            "title": updateBlackSiteStr
        }, function() {});
    } else {
        var updateBlackSiteStr = chrome.i18n.getMessage("addToBlackListStr");
        chrome.contextMenus.update("updateBlackSite", {
            "title": updateBlackSiteStr
        }, function() {});
    }
    if (white_site_set.has(url.hostname)) {
        var updateWhiteSiteStr = chrome.i18n.getMessage("removeFromWhiteListStr");
        chrome.contextMenus.update("updateWhiteSite", {
            "title": updateWhiteSiteStr
        }, function() {});
    } else {
        var updateWhiteSiteStr = chrome.i18n.getMessage("addToWhiteListStr");
        chrome.contextMenus.update("updateWhiteSite", {
            "title": updateWhiteSiteStr
        }, function() {});
    }

}

function updateWhiteSite(tab) {
    if (tab == null || tab.url == null) {
        console.warn("Could not get active tab url, update option menu failed.");
    }
    if (!tab.active || tab.url.startsWith("chrome"))
        return;
    var white_site = JSON.parse(localStorage.getItem("white_site"));
    var white_site_set = new Set(white_site);
    var url = new URL(tab.url);
    if (white_site_set.has(url.hostname)) {
        white_site_set.delete(url.hostname);
    } else {
        white_site_set.add(url.hostname);
    }
    localStorage.setItem("white_site", JSON.stringify(Array.from(white_site_set)));
}
function updateBlackSite(tab) {
    if (tab == null || tab.url == null) {
        console.warn("Could not get active tab url, update option menu failed.");
    }
    if (!tab.active || tab.url.startsWith("chrome"))
        return;
    var black_site = JSON.parse(localStorage.getItem("black_site"));
    var black_site_set = new Set(black_site);
    var url = new URL(tab.url);
    if (black_site_set.has(url.hostname)) {
        black_site_set.delete(url.hostname);
    } else {
        black_site_set.add(url.hostname);
    }
    localStorage.setItem("black_site", JSON.stringify(Array.from(black_site_set)));

}
chrome.notifications.onClicked.addListener(function(id) {
    launchUI();
    chrome.notifications.clear(id, function() {});
});

chrome.commands.onCommand.addListener(function(command) {
    if (command === "toggle-capture") {
        var integration = localStorage.getItem("integration");
        if (integration == "false" || integration == null) {
            enableCapture();
        } else if (integration == "true") {
            disableCapture();
        }
    }
});

window.addEventListener('storage', function(se) {
    //console.log(se);
    if (se.key == "integration") {
        if (se.newValue == "true") {
            enableCapture();
        } else if (se.newValue == "false") {
            disableCapture();
        }
    }

    if (se.key == "monitorAria2") {
        if (se.newValue == "true") {
            enableMonitor();
        } else if (se.newValue == "false") {
            disableMonitor();
        }
    }
});

// receive request from other extension
/**
 * @typedef downloadItem
 * @type {Object}
 * @property {String} url
 * @property {String} filename
 * @property {String} referrer
 */
chrome.runtime.onMessageExternal.addListener (
    function (downloadItem) {
        var allowExternalRequest = localStorage.getItem("allowExternalRequest");
        if (allowExternalRequest == "true"){
            const rpc_list = fetchRpcList();
            var rpc_url = getRpcUrl(downloadItem.url, rpc_list);
            aria2Send(downloadItem.url, rpc_url, downloadItem);
        }
    }
);

function enableMonitor(){
    if (MonitorId > -1) {
        console.log("Warn: Monitor has already started.");
        return;
    }
    monitorAria2();
    MonitorId = setInterval(monitorAria2, MonitorRate);
    localStorage.setItem("monitorAria2", true);
    chrome.contextMenus.update("monitorAria2", { checked: true });
}

function disableMonitor(){
    clearInterval(MonitorId);
    MonitorId = -1;
    chrome.browserAction.setBadgeText({text:""});
    localStorage.setItem("monitorAria2", false);
    chrome.contextMenus.update("monitorAria2", { checked: false });
}

function monitorAria2(){
    var rpc_data = {
        "jsonrpc": "2.0",
        "method": "aria2.getGlobalStat",
        "id": new Date().getTime(),
        "params": []
    };
    const rpc_list = fetchRpcList();
    var rpcUrl =getRpcUrl("",rpc_list);
    var result = parse_url(rpcUrl);
    var auth = result[1];
    if (auth && auth.indexOf('token:') == 0) {
        rpc_data.params.unshift(auth);
    }

    var parameter = {
        'url': result[0],
        'dataType': 'json',
        type: 'POST',
        data: JSON.stringify(rpc_data),
        'headers': {
            'Authorization': auth
        }
    };
    HttpSendRead(parameter).done(function(json, textStatus, jqXHR) {
        var numActive = json.result.numActive;
        var numStopped = json.result.numStopped;
        var numWaitting = json.result.numWaiting;
        /* Tune the monitor rate dynamiclly */
        if (numActive > 0 && MonitorRate == 3000) {
            MonitorRate = 1000;
            disableMonitor();
            enableMonitor();
        } else if (numActive == 0 && MonitorRate == 1000) {
            MonitorRate = 3000;
            disableMonitor();
            enableMonitor();
        }
        chrome.browserAction.setBadgeBackgroundColor({ color: "green" });
        chrome.browserAction.setBadgeText({ text: numActive });
        chrome.browserAction.setTitle({ title: `Active: ${numActive} Wait: ${numWaitting} Stop: ${numStopped}` });
    }).fail(function (jqXHR, textStatus, errorThrown) {
        chrome.browserAction.setBadgeBackgroundColor({ color: "red" });
        chrome.browserAction.setBadgeText({ text: "E" });
    });
}

/******** init popup url icon, capture and aria2 monitor ********/
var webUIOpenStyle = localStorage.getItem("webUIOpenStyle");
if (webUIOpenStyle == "popup") {
    var index = chrome.extension.getURL('ui/ariang/popup.html');
    chrome.browserAction.setPopup({
        popup: index
    });
}
chrome.contextMenus.removeAll();
createOptionMenu();
var integration = localStorage.getItem("integration");
if (integration == "true") {
    enableCapture();
} else if (integration == "false" || integration == null) {
    disableCapture();
}
var integration = localStorage.getItem("monitorAria2");
if (integration == "true") {
    enableMonitor();
} else if (integration == "false" || integration == null) {
    disableMonitor();
}

//软件版本更新提示
var manifest = chrome.runtime.getManifest();
var previousVersion = localStorage.getItem("version");
if (previousVersion == "" || previousVersion != manifest.version) {
    var opt = {
        type: "basic",
        title: "更新",
        message: "\n支持在弹出窗口中打开AriaNG。",
        iconUrl: "images/logo64.png",
        requireInteraction: true
    };
    var id = new Date().getTime().toString();
    //showNotification(id, opt);
    localStorage.setItem("version", manifest.version);
}