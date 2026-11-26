using Toybox.Graphics;
using Toybox.Time;
using Toybox.WatchUi;

class BewMainView extends WatchUi.View {
    var dayOffset = 0;

    function initialize() {
        View.initialize();
    }

    function onShow() {
        try {
            getSyncManager().syncNow(false);
        } catch (ex) {
        }
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
        var cy = h / 2;

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var selectedMoment = getSelectedMoment();
        var selectedKey = BewStorage.formatDateKey(selectedMoment);
        var code = BewStorage.getShift(selectedKey);
        var shiftColor = BewStorage.getShiftColor(code);
        var isHol = BewStorage.isHoliday(selectedKey);

        var liveStatus = (dayOffset == 0) ? BewStorage.getLiveShiftStatus() : {"state" => :none};
        var liveState = liveStatus.get("state");

        // Anillo exterior circular adaptado al Fenix 6X Pro
        var ringRadius = (w / 2) - 4;
        dc.setPenWidth(4);
        dc.setColor(0x1E2534, Graphics.COLOR_TRANSPARENT);
        dc.drawCircle(cx, cy, ringRadius);

        if (dayOffset == 0 && liveState == :active) {
            var activeColor = BewStorage.getShiftColor(liveStatus.get("code"));
            var prog = liveStatus.get("progress");
            var deg = (prog * 360).toNumber();
            if (deg < 4) {
                deg = 4;
            }
            if (deg >= 360) {
                dc.setColor(activeColor, Graphics.COLOR_TRANSPARENT);
                dc.drawCircle(cx, cy, ringRadius);
            } else {
                dc.setColor(activeColor, Graphics.COLOR_TRANSPARENT);
                dc.drawArc(cx, cy, ringRadius, Graphics.ARC_CLOCKWISE, 90, 90 - deg);
            }
        } else if (!code.equals("")) {
            dc.setColor(shiftColor, Graphics.COLOR_TRANSPARENT);
            dc.drawCircle(cx, cy, ringRadius);
        }
        dc.setPenWidth(1);

        // Guías sutiles de botones (UP/DOWN días, START semana)
        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(14, 72, Graphics.FONT_XTINY, "^", Graphics.TEXT_JUSTIFY_LEFT);
        dc.drawText(14, h - 92, Graphics.FONT_XTINY, "v", Graphics.TEXT_JUSTIFY_LEFT);
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(w - 14, 76, 3);

        // Cabecera superior
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        var headerTag = (dayOffset == 0) ? "BEW · HOY" : "BEW · ZETO";
        dc.drawText(cx, 16, Graphics.FONT_XTINY, headerTag, Graphics.TEXT_JUSTIFY_CENTER);

        var dateLabel = BewStorage.formatDisplayDate(selectedMoment);
        if (isHol) {
            dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, 38, Graphics.FONT_SMALL, "* " + dateLabel + " *", Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, 38, Graphics.FONT_SMALL, dateLabel, Graphics.TEXT_JUSTIFY_CENTER);
        }

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

        // Tercera línea contextual: tiempo restante / próximo servicio / horario
        if (dayOffset == 0 && liveState == :active) {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, boxY + 74, Graphics.FONT_XTINY, "Quedan " + BewStorage.formatDurationHm(liveStatus.get("remMin")), Graphics.TEXT_JUSTIFY_CENTER);
        } else if (dayOffset == 0 && liveState == :upcoming) {
            dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, boxY + 74, Graphics.FONT_XTINY, "Entras en " + BewStorage.formatDurationHm(liveStatus.get("inMin")), Graphics.TEXT_JUSTIFY_CENTER);
        } else if (dayOffset == 0 && liveState == :next) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            var nTxt = "Prox: " + liveStatus.get("dayLabel") + " " + liveStatus.get("code") + " " + liveStatus.get("startStr");
            dc.drawText(cx, boxY + 74, Graphics.FONT_XTINY, nTxt, Graphics.TEXT_JUSTIFY_CENTER);
        } else {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, boxY + 74, Graphics.FONT_XTINY, BewStorage.getShiftTimeInfo(code), Graphics.TEXT_JUSTIFY_CENTER);
        }

        // Próximos 3 días
        var yStart = 182;
        for (var i = 1; i <= 3; i++) {
            var nextM = BewStorage.addDaysToMoment(selectedMoment, i);
            var nextKey = BewStorage.formatDateKey(nextM);
            var nextCode = BewStorage.getShift(nextKey);
            var nextDisplay = nextCode.equals("") ? "--" : nextCode;
            var rowY = yStart + (i - 1) * 23;

            dc.setColor(BewStorage.isHoliday(nextKey) ? Graphics.COLOR_RED : Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(54, rowY, Graphics.FONT_XTINY, BewStorage.formatDisplayDate(nextM), Graphics.TEXT_JUSTIFY_LEFT);

            dc.setColor(BewStorage.getShiftColor(nextCode), Graphics.COLOR_TRANSPARENT);
            dc.drawText(w - 54, rowY, Graphics.FONT_XTINY, nextDisplay, Graphics.TEXT_JUSTIFY_RIGHT);
        }

        // Estado de sincronización
        var syncMgr = getSyncManager();
        var syncStatus = syncMgr.getStatusText();
        if (syncStatus != null && !syncStatus.equals("")) {
            dc.setColor(syncMgr.isSyncing ? Graphics.COLOR_GREEN : Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h - 22, Graphics.FONT_XTINY, syncStatus, Graphics.TEXT_JUSTIFY_CENTER);
        }
    }
}
