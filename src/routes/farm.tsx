import { BrowseFarms } from "@/components/farm/BrowseFarms";
import { CreateFarm } from "@/components/farm/CreateFarm";
import { ManageFarms } from "@/components/farm/ManageFarms";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/farm")({
  component: RouteComponent,
});

type TabViews = "browse" | "manage" | "create";
function RouteComponent() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabViews>("browse");

  return (
    <div className="min-h-screen !p-3 sm:!p-6 !mb-[50px]">
      <div className="text-center mb-6 sm:mb-8">
        <div className="relative inline-block">
          <h2 className="font-mono font-bold text-xl sm:text-2xl uppercase tracking-[0.2em]  inline-block px-6 py-3">
            [{t("common.farm_alpha")}]
          </h2>
        </div>
        <div className="flex items-end justify-end w-full">
          <Button
            variant="outline"
            onClick={() => {
              if (activeTab === "create") {
                setActiveTab("browse");
              } else {
                setActiveTab("create");
              }
            }}
            className="mt-4 !text-foreground dark:!text-foreground hover:!text-background dark:hover:!text-background"
          >
            {activeTab === "create" ? t("common.view_farms") : t("common.create_farm")}
          </Button>
        </div>
      </div>

      {activeTab === "create" ? (
        <CreateFarm />
      ) : (
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8 mt-8">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabViews)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="browse">[ {t("common.browse_farms")} ]</TabsTrigger>
              <TabsTrigger value="manage">[ {t("common.my_farms")} ]</TabsTrigger>
            </TabsList>
            <TabsContent value="browse" className="space-y-6 sm:space-y-8">
              <BrowseFarms />
            </TabsContent>
            <TabsContent value="manage" className="space-y-6 sm:space-y-8">
              <ManageFarms />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
