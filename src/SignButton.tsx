import { useSignMessage } from "wagmi";
import { useTranslation } from "react-i18next";

export function SignButton() {
  const { signMessage, isPending, data, error } = useSignMessage();
  const { t } = useTranslation();

  return (
    <>
      <button type="button" onClick={() => signMessage({ message: "hello world" })} disabled={isPending}>
        {isPending ? t("common.loading") : t("create.sign_message")}
      </button>
      {data && (
        <>
          <div>Signature</div>
          <div>{data}</div>
        </>
      )}
      {error && (
        <>
          <div>Error</div>
          <div>{error.message}</div>
        </>
      )}
    </>
  );
}
