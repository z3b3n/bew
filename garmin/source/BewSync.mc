using Toybox.Application.Properties;
using Toybox.Application.Storage;
using Toybox.Communications;
using Toybox.System;
using Toybox.Time;
using Toybox.Time.Gregorian;
using Toybox.WatchUi;

var gSyncManager = null;

function getSyncManager() {
    if (gSyncManager == null) {
        gSyncManager = new BewSyncManager();
    }
    return gSyncManager;
}

class BewSyncManager {
    var isSyncing = false;
    var lastStatus = "";
    var lastSyncEpoch = 0;

    function initialize() {
    }

    function getSyncUrl() {
        var propUrl = null;
        try {
            propUrl = Properties.getValue("syncUrl");
        } catch (ex) {
            propUrl = null;
        }
        if (propUrl != null && propUrl instanceof String && !propUrl.equals("")) {
            return propUrl;
        }
        return BewSyncConfig.DEFAULT_SYNC_URL;
    }

    function syncNow(force) {
        var url = getSyncUrl();
        if (url == null || url.equals("")) {
            if (force) {
                lastStatus = "Sin URL";
                WatchUi.requestUpdate();
            }
            return;
        }

        var deviceSettings = System.getDeviceSettings();
        if (deviceSettings == null || !deviceSettings.phoneConnected) {
            if (force) {
                lastStatus = "Sin movil";
                WatchUi.requestUpdate();
            }
            return;
        }

        var nowEpoch = Time.now().value();
        if (!force && lastSyncEpoch > 0 && (nowEpoch - lastSyncEpoch) < 60) {
            return;
        }

        if (isSyncing) {
            return;
        }

        isSyncing = true;
        lastStatus = "Sync...";
        WatchUi.requestUpdate();

        Communications.makeWebRequest(
            url,
            {"t" => nowEpoch.toString()},
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_TEXT_PLAIN
            },
            method(:onSyncResponse)
        );
    }

    function onSyncResponse(responseCode, data) {
        isSyncing = false;
        if (responseCode == 200 && data != null && data instanceof String) {
            BewStorage.importSyncPayload(data);
            var now = Time.now();
            lastSyncEpoch = now.value();
            var info = Gregorian.info(now, Time.FORMAT_SHORT);
            lastStatus = "Sync " + BewStorage.pad2(info.hour) + ":" + BewStorage.pad2(info.min);
            Storage.setValue("_lastSync", lastStatus);
        } else {
            lastStatus = "Err " + responseCode.toString();
        }
        WatchUi.requestUpdate();
    }

    function getStatusText() {
        if (lastStatus != null && !lastStatus.equals("")) {
            return lastStatus;
        }
        var stored = Storage.getValue("_lastSync");
        if (stored != null && stored instanceof String) {
            return stored;
        }
        return "";
    }
}
