using Toybox.WatchUi;

class BewEditShiftDelegate extends WatchUi.Menu2InputDelegate {
    var dateKey;

    function initialize(key) {
        Menu2InputDelegate.initialize();
        dateKey = key;
    }

    function onSelect(item) {
        var id = item.getId();
        var code = id.equals("CLEAR") ? "" : id;
        BewStorage.setShift(dateKey, code);
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }

    function onBack() {
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}

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
        } else if (id == :week) {
            var weekView = new BewWeekView();
            WatchUi.switchToView(weekView, new BewWeekDelegate(weekView), WatchUi.SLIDE_LEFT);
        } else if (id == :summary) {
            var summaryView = new BewSummaryView(mainView.getSelectedMoment());
            WatchUi.switchToView(summaryView, new BewSummaryDelegate(summaryView), WatchUi.SLIDE_LEFT);
        } else if (id == :today) {
            mainView.resetToday();
            WatchUi.popView(WatchUi.SLIDE_DOWN);
        } else if (id == :edit) {
            var key = BewStorage.formatDateKey(mainView.getSelectedMoment());
            var editMenu = new WatchUi.Menu2({:title => "Turno " + key});
            editMenu.addItem(new WatchUi.MenuItem("M - Manana", "08:00 - 15:00", "M", {}));
            editMenu.addItem(new WatchUi.MenuItem("T - Tarde", "15:00 - 21:00", "T", {}));
            editMenu.addItem(new WatchUi.MenuItem("N - Noche", "21:00 - 08:00", "N", {}));
            editMenu.addItem(new WatchUi.MenuItem("AD - Arco Diurno", "08:00 - 20:00", "AD", {}));
            editMenu.addItem(new WatchUi.MenuItem("AN - Arco Nocturno", "20:00 - 08:00", "AN", {}));
            editMenu.addItem(new WatchUi.MenuItem("VN - Viernes Noche", "20:00 - 08:00", "VN", {}));
            editMenu.addItem(new WatchUi.MenuItem("L - Libre", "Dia libre", "L", {}));
            editMenu.addItem(new WatchUi.MenuItem("F - Festivo", "Festivo", "F", {}));
            editMenu.addItem(new WatchUi.MenuItem("C - Curso", "Formacion", "C", {}));
            editMenu.addItem(new WatchUi.MenuItem("PO - Perm. Oficial", "Permiso", "PO", {}));
            editMenu.addItem(new WatchUi.MenuItem("AP - Asuntos Prop.", "Permiso", "AP", {}));
            editMenu.addItem(new WatchUi.MenuItem("Borrar turno", "Dejar sin asignar", "CLEAR", {}));
            WatchUi.switchToView(editMenu, new BewEditShiftDelegate(key), WatchUi.SLIDE_LEFT);
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
        var weekView = new BewWeekView();
        WatchUi.pushView(weekView, new BewWeekDelegate(weekView), WatchUi.SLIDE_LEFT);
        return true;
    }

    function onMenu() {
        var menu = new WatchUi.Menu2({:title => "BEW Opciones"});
        menu.addItem(new WatchUi.MenuItem("Sincronizar", "Descargar turnos", :sync, {}));
        menu.addItem(new WatchUi.MenuItem("Vista Semana", "Proximos 7 dias", :week, {}));
        menu.addItem(new WatchUi.MenuItem("Resumen Mes", "Horas y turnos", :summary, {}));
        menu.addItem(new WatchUi.MenuItem("Ir a Hoy", "Fecha actual", :today, {}));
        menu.addItem(new WatchUi.MenuItem("Editar turno", "Modificar este dia", :edit, {}));
        WatchUi.pushView(menu, new BewMenuDelegate(mainView), WatchUi.SLIDE_UP);
        return true;
    }
}
