import { getAuthStr } from "./getAuthStr";
import { config, date } from ".";

export function getWssUrl() {
  return config.hostUrl +
    "?authorization=" +
    getAuthStr(date) +
    "&date=" +
    date +
    "&host=" +
    config.host;
}
