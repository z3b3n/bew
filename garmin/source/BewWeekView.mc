using Toybox.Graphics;
using Toybox.Time;
using Toybox.WatchUi;

class BewWeekView extends WatchUi.View {
    var weekOffset = 0;

    function initialize() {
        View.initialize();
    }

    function moveWeek(delta) {
        weekOffset += delta;
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        var w = dc.getWidth();
        var cx = w / 2;

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        var title = (weekOffset == 0) ? "SEMANA · HOY" : "SEMANA · ZETO";
        dc.drawText(cx, 14, Graphics.FONT_XTINY, title, Graphics.TEXT_JUSTIFY_CENTER);

        var today = Time.today();
        var yStart = 42;
        for (var i = 0; i < 7; i++) {
            var dayM = BewStorage.addDaysToMoment(today, weekOffset * 7 + i);
            var dayKey = BewStorage.formatDateKey(dayM);
            var code = BewStorage.getShift(dayKey);
            var isToday = (weekOffset == 0 && i == 0);
            var isHol = BewStorage.isHoliday(dayKey);
            var rowY = yStart + i * 28;

            if (isToday) {
                dc.setColor(0x161B26, Graphics.COLOR_TRANSPARENT);
                dc.fillRoundedRectangle(32, rowY - 2, w - 64, 24, 6);
            }

            if (isHol) {
                dc.setColor(Graphics.COLOR_RED, Graphics.COLOR_TRANSPARENT);
            } else if (isToday) {
                dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
            } else {
                dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            }
            dc.drawText(42, rowY, Graphics.FONT_XTINY, BewStorage.formatDisplayDate(dayM), Graphics.TEXT_JUSTIFY_LEFT);

            var rightTxt = code.equals("") ? "--" : (code + "  " + BewStorage.getShiftShortHours(code));
            if (code.equals("L") || code.equals("F") || code.equals("C") || code.equals("PO") || code.equals("AP")) {
                rightTxt = BewStorage.getShiftShortHours(code);
            }
            dc.setColor(BewStorage.getShiftColor(code), Graphics.COLOR_TRANSPARENT);
            dc.drawText(w - 42, rowY, Graphics.FONT_XTINY, rightTxt, Graphics.TEXT_JUSTIFY_RIGHT);
        }

        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 246, Graphics.FONT_XTINY, "START: Resumen", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class BewWeekDelegate extends WatchUi.BehaviorDelegate {
    var weekView;

    function initialize(view) {
        BehaviorDelegate.initialize();
        weekView = view;
    }

    function onNextPage() {
        weekView.moveWeek(1);
        return true;
    }

    function onPreviousPage() {
        weekView.moveWeek(-1);
        return true;
    }

    function onSelect() {
        var summaryView = new BewSummaryView(Time.today());
        WatchUi.switchToView(summaryView, new BewSummaryDelegate(summaryView), WatchUi.SLIDE_LEFT);
        return true;
    }

    function onBack() {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
