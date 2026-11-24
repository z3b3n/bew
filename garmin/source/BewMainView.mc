using Toybox.Graphics;
using Toybox.Time;
using Toybox.WatchUi;

class BewMainView extends WatchUi.View {
    var dayOffset = 0;

    function initialize() {
        View.initialize();
    }

    function moveDay(delta) {
        dayOffset += delta;
        WatchUi.requestUpdate();
    }

    function resetToday() {
        dayOffset = 0;
        WatchUi.requestUpdate();
    }

    function getSelectedMoment() {
        return BewStorage.addDaysToMoment(Time.today(), dayOffset);
    }

    function onUpdate(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var selectedMoment = getSelectedMoment();
        var selectedKey = BewStorage.formatDateKey(selectedMoment);
        var code = BewStorage.getShift(selectedKey);
        var shiftColor = BewStorage.getShiftColor(code);

        // Cabecera superior
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        var headerTag = (dayOffset == 0) ? "BEW · HOY" : "BEW · ZETO";
        dc.drawText(cx, 16, Graphics.FONT_XTINY, headerTag, Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 38, Graphics.FONT_SMALL, BewStorage.formatDisplayDate(selectedMoment), Graphics.TEXT_JUSTIFY_CENTER);

        // Tarjeta central del turno
        var boxX = 28;
        var boxY = 72;
        var boxW = w - 56;
        var boxH = 102;

        dc.setColor(0x161B26, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(boxX, boxY, boxW, boxH, 16);

        dc.setColor(shiftColor, Graphics.COLOR_TRANSPARENT);
        dc.setPenWidth(3);
        dc.drawRoundedRectangle(boxX, boxY, boxW, boxH, 16);
        dc.setPenWidth(1);

        var bigCode = code.equals("") ? "--" : code;
        dc.drawText(cx, boxY + 8, Graphics.FONT_NUMBER_MILD, bigCode, Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, boxY + 52, Graphics.FONT_XTINY, BewStorage.getShiftLabel(code), Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, boxY + 74, Graphics.FONT_XTINY, BewStorage.getShiftTimeInfo(code), Graphics.TEXT_JUSTIFY_CENTER);

        // Próximos 3 días
        var yStart = 184;
        for (var i = 1; i <= 3; i++) {
            var nextM = BewStorage.addDaysToMoment(selectedMoment, i);
            var nextKey = BewStorage.formatDateKey(nextM);
            var nextCode = BewStorage.getShift(nextKey);
            var nextDisplay = nextCode.equals("") ? "--" : nextCode;
            var rowY = yStart + (i - 1) * 24;

            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(54, rowY, Graphics.FONT_XTINY, BewStorage.formatDisplayDate(nextM), Graphics.TEXT_JUSTIFY_LEFT);

            dc.setColor(BewStorage.getShiftColor(nextCode), Graphics.COLOR_TRANSPARENT);
            dc.drawText(w - 54, rowY, Graphics.FONT_XTINY, nextDisplay, Graphics.TEXT_JUSTIFY_RIGHT);
        }
    }
}
