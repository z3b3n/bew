using Toybox.Application.Properties;
using Toybox.Background;
using Toybox.Communications;
using Toybox.Lang;
using Toybox.System;
using Toybox.Time;

(:background)
class BewBackgroundDelegate extends System.ServiceDelegate {
    function initialize() {
        ServiceDelegate.initialize();
    }

    function onTemporalEvent() {
        var url = null;
        try {
            url = Properties.getValue("syncUrl");
        } catch (ex) {
            url = null;
        }
        if (url == null || !(url instanceof Lang.String) || url.equals("")) {
            url = BewSyncConfig.DEFAULT_SYNC_URL;
        }
        if (url == null || url.equals("")) {
            Background.exit(null);
            return;
        }

        var deviceSettings = System.getDeviceSettings();
        if (deviceSettings == null || !deviceSettings.phoneConnected) {
            Background.exit(null);
            return;
        }

        try {
            Communications.makeWebRequest(
                url,
                {"t" => Time.now().value().toString()},
                {
                    :method => Communications.HTTP_REQUEST_METHOD_GET,
                    :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_TEXT_PLAIN
                },
                new Lang.Method(self, :onResponse)
            );
        } catch (ex) {
            Background.exit(null);
        }
    }

    function onResponse(responseCode, data) {
        if (responseCode == 200 && data != null && data instanceof Lang.String) {
            Background.exit(data);
        } else {
            Background.exit(null);
        }
    }
}
