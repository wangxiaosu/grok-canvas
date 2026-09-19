export const LOGIN_REQUIRED_MESSAGE = "请先登录";
export const GENERATION_FAILED_MESSAGE = "生成失败";
export const LOGIN_ACTION_LABEL = "登录";

export function loginRequired(loggedIn: boolean | null | undefined): boolean {
  return loggedIn === false;
}

export function generationStatusFeedback(loggedIn: boolean | null | undefined): {
  message: string;
  actionLabel?: string;
} {
  if (loginRequired(loggedIn)) {
    return { message: LOGIN_REQUIRED_MESSAGE, actionLabel: LOGIN_ACTION_LABEL };
  }
  return { message: GENERATION_FAILED_MESSAGE };
}
