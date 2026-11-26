using Toybox.WatchUi;

class BewMenuDelegate extends WatchUi.Menu2InputDelegate {
    var mainView;

    function initialize(view) {
        Menu2InputDelegate.initialize();
        mainView = view;
    }

    function onSelect(item) {
        var id = item.getId();
        if (id == :sync) {
            WatchUi.popView(WatchUi.SLIDE_DOWN);
            getSyncManager().syncNow(true);
        } else if (id == :today) {
            mainView.resetToday();
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        } else if (id == :summary) {
            var summaryView = new BewSummaryView(mainView.getSelectedMoment());
            WatchUi.switchToView(summaryView, new BewSummaryDelegate(), WatchUi.SLIDE_LEFT);
        }
    }

    function onBack() {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

class BewDelegate extends WatchUi.BehaviorDelegate {
    var mainView;

    function initialize(view) {
        BehaviorDelegate.initialize();
        mainView = view;
    }

    function onNextPage() {
        mainView.moveDay(1);
        return true;
    }

    function onPreviousPage() {
        mainView.moveDay(-1);
        return true;
    }

    function onSelect() {
        var key = BewStorage.formatDateKey(mainView.getSelectedMoment());
        BewStorage.cycleShift(key);
        WatchUi.requestUpdate();
        return true;
    }

    function onMenu() {
        var menu = new WatchUi.Menu2({:title => "BEW Opciones"});
        menu.addItem(new WatchUi.MenuItem("Sincronizar", "Descargar turnos", :sync, {}));
        menu.addItem(new WatchUi.MenuItem("Ir a Hoy", "Fecha actual", :today, {}));
        menu.addItem(new WatchUi.MenuItem("Resumen Mes", "Horas y turnos", :summary, {}));
        WatchUi.pushView(menu, new BewMenuDelegate(mainView), WatchUi.SLIDE_UP);
        return true;
    }
}
