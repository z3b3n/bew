using Toybox.Application.Storage;
using Toybox.Graphics;
using Toybox.Time;
using Toybox.Time.Gregorian;

(:glance)
module BewStorage {
    var SHIFT_CYCLE = ["", "M", "T", "N", "AD", "AN", "VN", "C", "PO", "AP", "L", "F"];

    function getShiftColor(code) {
        if (code == null || code.equals("")) {
            return Graphics.COLOR_DK_GRAY;
        }
        if (code.equals("M")) {
            return Graphics.COLOR_YELLOW;
        }
        if (code.equals("T")) {
            return Graphics.COLOR_BLUE;
        }
        if (code.equals("N")) {
            return Graphics.COLOR_PURPLE;
        }
        if (code.equals("AD")) {
            return Graphics.COLOR_GREEN;
        }
        if (code.equals("AN")) {
            return Graphics.COLOR_PINK;
        }
        if (code.equals("VN")) {
            return Graphics.COLOR_BLUE;
        }
        if (code.equals("C")) {
            return Graphics.COLOR_ORANGE;
        }
        if (code.equals("PO") || code.equals("AP")) {
            return 0x00AAAA;
        }
        if (code.equals("F")) {
            return Graphics.COLOR_RED;
        }
        return Graphics.COLOR_LT_GRAY;
    }

    function getShiftLabel(code) {
        if (code == null || code.equals("")) {
            return "Sin asignar";
        }
        if (code.equals("M")) {
            return "Manana";
        }
        if (code.equals("T")) {
            return "Tarde";
        }
        if (code.equals("N")) {
            return "Noche";
        }
        if (code.equals("AD")) {
            return "Arco Diurno";
        }
        if (code.equals("AN")) {
            return "Arco Nocturno";
        }
        if (code.equals("VN")) {
            return "Viernes Noche";
        }
        if (code.equals("C")) {
            return "Curso";
        }
        if (code.equals("PO")) {
            return "Perm. Oficial";
        }
        if (code.equals("AP")) {
            return "Asuntos Prop.";
        }
        if (code.equals("L")) {
            return "Libre";
        }
        if (code.equals("F")) {
            return "Festivo";
        }
        return code;
    }

    function getShiftTimeInfo(code) {
        if (code == null || code.equals("")) {
            return "Pulsa SELECT";
        }
        if (code.equals("M")) {
            return "08:00 - 15:00 (7h)";
        }
        if (code.equals("T")) {
            return "15:00 - 21:00 (6h)";
        }
        if (code.equals("N")) {
            return "21:00 - 08:00 (11h)";
        }
        if (code.equals("AD")) {
            return "08:00 - 20:00 (12h)";
        }
        if (code.equals("AN") || code.equals("VN")) {
            return "20:00 - 08:00 (12h)";
        }
        if (code.equals("C") || code.equals("PO") || code.equals("AP")) {
            return getShiftLabel(code) + " (0h)";
        }
        if (code.equals("L")) {
            return "Dia Libre (0h)";
        }
        if (code.equals("F")) {
            return "Festivo (0h)";
        }
        return "";
    }

    function getShiftHours(code) {
        if (code == null) {
            return 0;
        }
        if (code.equals("M")) {
            return 7;
        }
        if (code.equals("T")) {
            return 6;
        }
        if (code.equals("N")) {
            return 11;
        }
        if (code.equals("AD") || code.equals("AN") || code.equals("VN")) {
            return 12;
        }
        return 0;
    }

    function pad2(n) {
        if (n < 10) {
            return "0" + n.toString();
        }
        return n.toString();
    }

    function addDaysToMoment(moment, days) {
        var delta = new Time.Duration(days * Gregorian.SECONDS_PER_DAY);
        return moment.add(delta);
    }

    function formatDateKey(moment) {
        var info = Gregorian.info(moment, Time.FORMAT_SHORT);
        return info.year.toString() + "-" + pad2(info.month) + "-" + pad2(info.day);
    }

    function getWeekdayShortEs(dayOfWeek) {
        var names = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
        if (dayOfWeek >= 1 && dayOfWeek <= 7) {
            return names[dayOfWeek - 1];
        }
        return "";
    }

    function getMonthShortEs(month) {
        var names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        if (month >= 1 && month <= 12) {
            return names[month - 1];
        }
        return "";
    }

    function formatDisplayDate(moment) {
        var info = Gregorian.info(moment, Time.FORMAT_SHORT);
        return getWeekdayShortEs(info.day_of_week) + " " + info.day.toString() + " " + getMonthShortEs(info.month);
    }

    function getShift(dateKey) {
        var val = Storage.getValue(dateKey);
        if (val != null && val instanceof String) {
            return val;
        }
        return "";
    }

    function setShift(dateKey, code) {
        if (code == null || code.equals("")) {
            Storage.deleteValue(dateKey);
        } else {
            Storage.setValue(dateKey, code);
        }
    }

    function cycleShift(dateKey) {
        var current = getShift(dateKey);
        var nextIdx = 1;
        for (var i = 0; i < SHIFT_CYCLE.size(); i++) {
            if (SHIFT_CYCLE[i].equals(current)) {
                nextIdx = (i + 1) % SHIFT_CYCLE.size();
                break;
            }
        }
        var nextCode = SHIFT_CYCLE[nextIdx];
        setShift(dateKey, nextCode);
        return nextCode;
    }

    function computeMonthSummary(year, month) {
        var totalHours = 0;
        var countM = 0;
        var countT = 0;
        var countN = 0;
        var countAD = 0;
        var countAN = 0;
        var countVN = 0;

        var prefix = year.toString() + "-" + pad2(month) + "-";
        for (var d = 1; d <= 31; d++) {
            var code = getShift(prefix + pad2(d));
            if (code.equals("M")) {
                countM++;
                totalHours += 7;
            } else if (code.equals("T")) {
                countT++;
                totalHours += 6;
            } else if (code.equals("N")) {
                countN++;
                totalHours += 11;
            } else if (code.equals("AD")) {
                countAD++;
                totalHours += 12;
            } else if (code.equals("AN")) {
                countAN++;
                totalHours += 12;
            } else if (code.equals("VN")) {
                countVN++;
                totalHours += 12;
            }
        }

        return {
            "hours" => totalHours,
            "M" => countM,
            "T" => countT,
            "N" => countN,
            "AD" => countAD,
            "AN" => countAN,
            "VN" => countVN
        };
    }

    function isValidShiftCode(code) {
        return code.equals("M") ||
            code.equals("T") ||
            code.equals("N") ||
            code.equals("AD") ||
            code.equals("AN") ||
            code.equals("VN") ||
            code.equals("C") ||
            code.equals("PO") ||
            code.equals("AP") ||
            code.equals("L") ||
            code.equals("F");
    }

    // Formato soportado en settings y sync: "2026-12:L,AD,AN,M,T,N,..."
    function importMonthString(raw) {
        if (raw == null || !(raw instanceof String)) {
            return false;
        }
        var colonIdx = raw.find(":");
        if (colonIdx == null || colonIdx < 7) {
            return false;
        }
        var monthKey = raw.substring(0, colonIdx);
        var rest = raw.substring(colonIdx + 1, raw.length());
        var day = 1;
        var start = 0;
        for (var i = 0; i <= rest.length(); i++) {
            var isEnd = (i == rest.length());
            if (isEnd || rest.substring(i, i + 1).equals(",")) {
                var token = rest.substring(start, i);
                if (token.length() > 0 && token.substring(token.length() - 1, token.length()).equals("\r")) {
                    token = token.substring(0, token.length() - 1);
                }
                if (day <= 31) {
                    var key = monthKey + "-" + pad2(day);
                    if (token.equals("")) {
                        setShift(key, "");
                    } else if (isValidShiftCode(token)) {
                        setShift(key, token);
                    }
                }
                day++;
                start = i + 1;
            }
        }
        return true;
    }

    function importSyncPayload(raw) {
        if (raw == null || !(raw instanceof String)) {
            return 0;
        }
        var imported = 0;
        var start = 0;
        for (var i = 0; i <= raw.length(); i++) {
            var isEnd = (i == raw.length());
            if (isEnd || raw.substring(i, i + 1).equals("\n")) {
                var line = raw.substring(start, i);
                if (line.length() > 0 && line.substring(line.length() - 1, line.length()).equals("\r")) {
                    line = line.substring(0, line.length() - 1);
                }
                if (line.length() > 0 && !line.substring(0, 1).equals("#")) {
                    if (importMonthString(line)) {
                        imported++;
                    }
                }
                start = i + 1;
            }
        }
        return imported;
    }
}
