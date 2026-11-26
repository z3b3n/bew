using Toybox.Application;
using Toybox.Application.Properties;
using Toybox.Application.Storage;
using Toybox.Background;
using Toybox.Lang;
using Toybox.Time;
using Toybox.Time.Gregorian;

(:background)
class BewApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function onStart(state) {
        try {
            if (Toybox has :Background) {
                if (Background.getTemporalEventRegisteredTime() == null) {
                    Background.registerForTemporalEvent(new Time.Duration(2 * 60 * 60));
                }
            }
        } catch (ex) {
        }
    }

    function onStop(state) {
    }

    function onSettingsChanged() {
        importConfiguredMonths();
    }

    function getServiceDelegate() {
        return [new BewBackgroundDelegate()];
    }

    function onBackgroundData(data) {
        try {
            if (data != null && data instanceof Lang.String) {
                BewStorage.importSyncPayload(data);
                var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
                var status = "Sync " + BewStorage.pad2(info.hour) + ":" + BewStorage.pad2(info.min);
                Storage.setValue("_lastSync", status);
            }
        } catch (ex) {
        }
    }

    function importConfiguredMonths() {
        try {
            BewStorage.importMonthString(Properties.getValue("month1Data"));
            BewStorage.importMonthString(Properties.getValue("month2Data"));
        } catch (ex) {
        }
    }

    function getInitialView() {
        importConfiguredMonths();
        var view = new BewMainView();
        return [view, new BewDelegate(view)];
    }

    (:glance)
    function getGlanceView() {
        return [new BewGlanceView()];
    }
}
