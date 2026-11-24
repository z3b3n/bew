using Toybox.Graphics;
using Toybox.Time;
using Toybox.Time.Gregorian;
using Toybox.WatchUi;

class BewSummaryView extends WatchUi.View {
    var targetMoment;

    function initialize(moment) {
        View.initialize();
        targetMoment = moment;
    }

    function onUpdate(dc) {
        var w = dc.getWidth();
        var cx = w / 2;

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        var info = Gregorian.info(targetMoment, Time.FORMAT_SHORT);
        var summary = BewStorage.computeMonthSummary(info.year, info.month);

        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 20, Graphics.FONT_XTINY, "RESUMEN MES", Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 42, Graphics.FONT_SMALL, BewStorage.getMonthShortEs(info.month) + " " + info.year.toString(), Graphics.TEXT_JUSTIFY_CENTER);

        var totalH = summary.get("hours");
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 78, Graphics.FONT_NUMBER_MILD, totalH.toString() + "h", Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 132, Graphics.FONT_XTINY, "M: " + summary.get("M").toString() + "   T: " + summary.get("T").toString() + "   N: " + summary.get("N").toString(), Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(cx, 158, Graphics.FONT_XTINY, "AD: " + summary.get("AD").toString() + "   AN: " + summary.get("AN").toString(), Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, 212, Graphics.FONT_XTINY, "BACK para volver", Graphics.TEXT_JUSTIFY_CENTER);
    }
}

class BewSummaryDelegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onBack() {
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
        return true;
    }
}
