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
        var todayKey = BewStorage.formatDateKey(today);
        var tomorrow = BewStorage.addDaysToMoment(today, 1);

        var todayCode = BewStorage.getShift(todayKey);
        var tomorrowCode = BewStorage.getShift(BewStorage.formatDateKey(tomorrow));
        var isHol = BewStorage.isHoliday(todayKey);
        var status = BewStorage.getLiveShiftStatus();
        var state = status.get("state");

        // Fila superior
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(0, h * 0.08, Graphics.FONT_XTINY, "BEW · HOY", Graphics.TEXT_JUSTIFY_LEFT);

        if (isHol) {
            dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w - 2, h * 0.08, Graphics.FONT_XTINY, "FEST", Graphics.TEXT_JUSTIFY_RIGHT);
        } else {
            var tomorrowDisplay = tomorrowCode.equals("") ? "-" : tomorrowCode;
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w - 2, h * 0.08, Graphics.FONT_XTINY, "Man: " + tomorrowDisplay, Graphics.TEXT_JUSTIFY_RIGHT);
        }

        // Fila central
        var mainColor = BewStorage.getShiftColor(todayCode);
        var mainText = "";
        if (state == :active) {
            var aCode = status.get("code");
            mainColor = BewStorage.getShiftColor(aCode);
            mainText = aCode + " · -" + BewStorage.formatDurationHm(status.get("remMin"));
        } else if (!todayCode.equals("")) {
            mainText = todayCode + " · " + BewStorage.getShiftLabel(todayCode);
        } else {
            mainText = "Sin turno";
        }
        dc.setColor(mainColor, Graphics.COLOR_TRANSPARENT);
        dc.drawText(0, h * 0.36, Graphics.FONT_SMALL, mainText, Graphics.TEXT_JUSTIFY_LEFT);

        // Fila inferior: barra de progreso o próximo turno
        if (state == :active) {
            var prog = status.get("progress");
            var barW = w - 4;
            var barY = h - 10;
            dc.setColor(0x222836, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(0, barY, barW, 5, 2);
            var fillW = (barW * prog).toNumber();
            if (fillW < 4) {
                fillW = 4;
            }
            if (fillW > barW) {
                fillW = barW;
            }
            dc.setColor(mainColor, Graphics.COLOR_TRANSPARENT);
            dc.fillRoundedRectangle(0, barY, fillW, 5, 2);
        } else if (state == :upcoming) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(0, h * 0.70, Graphics.FONT_XTINY, "Entras en " + BewStorage.formatDurationHm(status.get("inMin")), Graphics.TEXT_JUSTIFY_LEFT);
        } else if (state == :next) {
            var nextStr = "Prox: " + status.get("dayLabel") + " " + status.get("code") + " " + status.get("startStr");
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(0, h * 0.70, Graphics.FONT_XTINY, nextStr, Graphics.TEXT_JUSTIFY_LEFT);
        }
    }
}
