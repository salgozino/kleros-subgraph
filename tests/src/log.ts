const ENABLE_LOGS = 0

/* LOG */
const logFormat = function (msg: string, args: any[]) {
    let i = 0

    console.log(
        msg.replace(/{}/g, function () {
            return typeof args[i] != 'undefined' ? args[i++] : '';
        })
    )
};

export const log = {
    error: (msg: string, args: any[]) => {ENABLE_LOGS > 0 && logFormat(msg, args)},
    warning: (msg: string, args: any[]) => {ENABLE_LOGS > 1 && logFormat(msg, args)},
    info: (msg: string, args: any[]) => {ENABLE_LOGS > 2 && logFormat(msg, args)},
    debug: (msg: string, args: any[]) => {ENABLE_LOGS > 3 && logFormat(msg, args)},
}