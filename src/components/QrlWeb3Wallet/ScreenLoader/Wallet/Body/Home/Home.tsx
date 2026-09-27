import { Alert, AlertDescription, AlertTitle } from "@/components/UI/Alert";
import withSuspense from "@/functions/withSuspense";
import { useStore } from "@/stores/store";
import { Loader, ShieldAlert } from "lucide-react";
import { observer } from "mobx-react-lite";
import { lazy } from "react";
import { useTranslation } from "react-i18next";

const AccountCreateImport = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Home/AccountCreateImport/AccountCreateImport"
      ),
  ),
);
const BackgroundVideo = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Home/BackgroundVideo/BackgroundVideo"
      ),
  ),
);

const Home = observer(() => {
  const { qrlStore } = useStore();
  const { qrlConnection } = qrlStore;
  const { isLoading, hasLegacyAddressFormat, blockchain } = qrlConnection;
  const { t } = useTranslation();

  return (
    <>
      <BackgroundVideo />
      <div className="relative z-10 flex w-full flex-col items-center p-8">
        {isLoading ? (
          <Loader className="animate-spin text-foreground" size="86" />
        ) : (
          <>
            {hasLegacyAddressFormat && (
              <Alert className="mb-4 w-full" variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>{t("home.legacyAddressChain.title")}</AlertTitle>
                <AlertDescription className="text-xs">
                  {t("home.legacyAddressChain.description", {
                    chainName: blockchain.chainName,
                  })}
                </AlertDescription>
              </Alert>
            )}
            <AccountCreateImport />
          </>
        )}
      </div>
    </>
  );
});

export default Home;
