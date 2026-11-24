using Toybox.Graphics;
using Toybox.Time;
using Toybox.WatchUi;

(:glance)
class BewGlanceView extends WatchUi.GlanceView {
    function initialize() {
        GlanceView.initialize();
    }

    function onUpdate(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var today = Time.today();
        var tomorrow = BewStorage.addDaysToMoment(today, 1);

        var todayCode = BewStorage.getShift(BewStorage.formatDateKey(today));
        var tomorrowCode = BewStorage.getShift(BewStorage.formatDateKey(tomorrow));

        var todayDisplay = todayCode.equals("") ? "Sin turno" : todayCode + " · " + BewStorage.getShiftLabel(todayCode);
        var tomorrowDisplay = tomorrowCode.equals("") ? "-" : tomorrowCode;

        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(0, h * 0.14, Graphics.FONT_XTINY, "BEW · HOY", Graphics.TEXT_JUSTIFY_LEFT);

        dc.setColor(BewStorage.getShiftColor(todayCode), Graphics.COLOR_TRANSPARENT);
        dc.drawText(0, h * 0.42, Graphics.FONT_SMALL, todayDisplay, Graphics.TEXT_JUSTIFY_LEFT);

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w - 2, h * 0.14, Graphics.FONT_XTINY, "Man: " + tomorrowDisplay, Graphics.TEXT_JUSTIFY_RIGHT);
    }
}
