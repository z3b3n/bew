using Toybox.Application;
using Toybox.Application.Properties;

class BewApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function onStart(state) {
        importConfiguredMonths();
    }

    function onStop(state) {
    }

    function onSettingsChanged() {
        importConfiguredMonths();
    }

    function importConfiguredMonths() {
        try {
            BewStorage.importMonthString(Properties.getValue("month1Data"));
            BewStorage.importMonthString(Properties.getValue("month2Data"));
        } catch (ex) {
        }
    }

    function getInitialView() {
        var view = new BewMainView();
        return [view, new BewDelegate(view)];
    }

    (:glance)
    function getGlanceView() {
        return [new BewGlanceView()];
    }
}
