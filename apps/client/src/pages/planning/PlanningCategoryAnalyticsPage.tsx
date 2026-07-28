import { useParams } from "react-router-dom";
import { PlanningWorkspace } from "../../components/planning/PlanningWorkspace";

export default function PlanningCategoryAnalyticsPage() {
  const { categoryId } = useParams();

  return <PlanningWorkspace view="analytics" categoryId={categoryId} />;
}
