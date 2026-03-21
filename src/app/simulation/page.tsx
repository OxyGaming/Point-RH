import SimulationForm from "@/components/simulation/SimulationForm";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";

export default function SimulationPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Nouvelle simulation</h1>
        <p className="text-gray-500 mt-1">
          Définissez l&apos;imprévu et lancez l&apos;analyse de mobilisabilité des agents.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-800">Paramètres de l&apos;imprévu</h2>
        </CardHeader>
        <CardBody>
          <SimulationForm />
        </CardBody>
      </Card>

      {/* Reminder rules */}
      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-semibold text-gray-800">Règles appliquées</h2>
        </CardHeader>
        <CardBody>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            {[
              { title: "Amplitude", desc: "11h général · 12h dépl. · 13h nuit sans remplacement · 10h30 réserve" },
              { title: "Travail effectif", desc: "Max 10h · 8h30 remplacé · 48h/GPT" },
              { title: "Repos journalier", desc: "12h standard · 10h réserve avec remplacement" },
              { title: "GPT", desc: "3 à 6 jours · 5 max avant RP simple · Pas 2 nuits consécutives" },
            ].map(({ title, desc }) => (
              <div key={title} className="bg-gray-50 rounded-lg p-3">
                <p className="font-semibold text-gray-800 text-xs mb-1">{title}</p>
                <p className="text-gray-500 text-xs">{desc}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
