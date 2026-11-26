using Toybox.Graphics;
using Toybox.Time;
using Toybox.Time.Gregorian;
using Toybox.WatchUi;

class BewSummaryView extends WatchUi.View {
    var targetYear;
    var targetMonth;

    function initialize(moment) {
        View.initialize();
        var info = Gregorian.info(moment, Time.FORMAT_SHORT);
        targetYear = info.year;
        targetMonth = info.month;
    }

    function moveMonth(delta) {
        targetMonth += delta;
        if (targetMonth > 12) {
            targetMonth = 1;
            targetYear += 1;
        } else if (targetMonth < 1) {
            targetMonth = 12;
            targetYear -= 1;
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        var w = dc.getWidth();
        var cx = w / 2;

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var summary = BewStorage.computeMonthSummary(targetYear, targetMonth);

        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 20, Graphics.FONT_XTINY, "RESUMEN MES", Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 42, Graphics.FONT_SMALL, BewStorage.getMonthShortEs(targetMonth) + " " + targetYear.toString(), Graphics.TEXT_JUSTIFY_CENTER);

        var totalH = summary.get("hours");
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 78, Graphics.FONT_NUMBER_MILD, totalH.toString() + "h", Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 132, Graphics.FONT_XTINY, "M: " + summary.get("M").toString() + "   T: " + summary.get("T").toString() + "   N: " + summary.get("N").toString(), Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(cx, 158, Graphics.FONT_XTINY, "AD: " + summary.get("AD").toString() + "   AN: " + summary.get("AN").toString() + "   VN: " + summary.get("VN").toString(), Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 214, Graphics.FONT_XTINY, "UP/DN Mes · START Hoy", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class BewSummaryDelegate extends WatchUi.BehaviorDelegate {
    var summaryView;

    function initialize(view) {
        BehaviorDelegate.initialize();
        summaryView = view;
    }

    function onNextPage() {
        summaryView.moveMonth(1);
        return true;
    }

    function onPreviousPage() {
        summaryView.moveMonth(-1);
        return true;
    }

    function onSelect() {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }

    function onBack() {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
