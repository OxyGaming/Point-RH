/**
 * Seed de la base de données.
 *
 * Crée :
 * - Un compte administrateur par défaut
 * - Un compte utilisateur standard de démonstration
 * - 5 agents de démonstration
 *
 * Identifiants admin par défaut :
 *   Email    : admin@point-rh.local
 *   Password : Admin1234!
 *
 * ⚠️ Changez le mot de passe admin après la première connexion en production.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const AGENTS_DEMO = [
  {
    matricule: "8006107R",
    nom: "CLANET",
    prenom: "MATHIEU",
    uch: "RIVE DROITE NORD",
    codeUch: "933713",
    codeSymboleGrade: "CP4NIV1",
    codeCollegeGrade: 2,
    posteAffectation: "AC, AIguilleur...",
    agentReserve: false,
    peutFaireNuit: true,
    peutEtreDeplace: false,
    regimeB: false,
    regimeC: false,
    habilitations: JSON.stringify(["AC"]),
  },
  {
    matricule: "9410129B",
    nom: "ESTRAGNAT",
    prenom: "SIMON",
    uch: "RIVE DROITE NORD",
    codeUch: "933713",
    codeSymboleGrade: "CO3",
    codeCollegeGrade: 1,
    posteAffectation: "Contrôleur",
    agentReserve: true,
    peutFaireNuit: true,
    peutEtreDeplace: true,
    regimeB: false,
    regimeC: false,
    habilitations: JSON.stringify(["AC", "Aiguilleur"]),
  },
  {
    matricule: "8410138E",
    nom: "SEFOUHI",
    prenom: "YAZID",
    uch: "RIVE DROITE NORD",
    codeUch: "933713",
    codeSymboleGrade: "CP5NIV2",
    codeCollegeGrade: 2,
    posteAffectation: "AC",
    agentReserve: false,
    peutFaireNuit: false,
    peutEtreDeplace: false,
    regimeB: true,
    regimeC: false,
    habilitations: JSON.stringify(["AC"]),
  },
  {
    matricule: "7309332B",
    nom: "OLLIER",
    prenom: "GREGORY",
    uch: "RIVE DROITE NORD",
    codeUch: "933713",
    codeSymboleGrade: "CP5NIV3",
    codeCollegeGrade: 2,
    posteAffectation: "AC",
    agentReserve: true,
    peutFaireNuit: true,
    peutEtreDeplace: true,
    regimeB: false,
    regimeC: false,
    habilitations: JSON.stringify(["AC", "Aiguilleur"]),
  },
  {
    matricule: "9605298S",
    nom: "JOHANNY",
    prenom: "THOMAS",
    uch: "RIVE DROITE NORD",
    codeUch: "933713",
    codeSymboleGrade: "CP5NIV1",
    codeCollegeGrade: 2,
    posteAffectation: "AC",
    agentReserve: false,
    peutFaireNuit: true,
    peutEtreDeplace: false,
    regimeB: false,
    regimeC: false,
    habilitations: JSON.stringify(["AC"]),
  },
];

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Utilisateurs ──────────────────────────────────────────────────────────

  const adminPassword = await bcrypt.hash("Admin1234!", 12);
  const userPassword = await bcrypt.hash("User1234!", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@point-rh.local" },
    update: { role: "ADMIN", isActive: true },
    create: {
      email: "admin@point-rh.local",
      name: "Administrateur",
      password: adminPassword,
      role: "ADMIN",
    },
  });
  console.log(`✅ Admin créé : ${admin.email}`);

  const user = await prisma.user.upsert({
    where: { email: "user@point-rh.local" },
    update: {},
    create: {
      email: "user@point-rh.local",
      name: "Utilisateur Demo",
      password: userPassword,
      role: "USER",
    },
  });
  console.log(`✅ Utilisateur demo créé : ${user.email}`);

  // ─── Agents de démonstration ───────────────────────────────────────────────

  for (const agent of AGENTS_DEMO) {
    await prisma.agent.upsert({
      where: { matricule: agent.matricule },
      // Ne pas écraser les champs gérés manuellement (habilitations, profil RH)
      update: {
        nom: agent.nom,
        prenom: agent.prenom,
        uch: agent.uch,
        codeUch: agent.codeUch,
        codeSymboleGrade: agent.codeSymboleGrade,
        codeCollegeGrade: agent.codeCollegeGrade,
      },
      create: agent,
    });
  }

  console.log(`✅ ${AGENTS_DEMO.length} agents de démo créés/mis à jour`);
  console.log("");
  console.log("─────────────────────────────────────────────────");
  console.log("  Identifiants par défaut :");
  console.log("  Admin  : admin@point-rh.local / Admin1234!");
  console.log("  User   : user@point-rh.local  / User1234!");
  console.log("  ⚠️  Changez ces mots de passe en production !");
  console.log("─────────────────────────────────────────────────");
  console.log("   → Importez Test.xlsx pour ajouter des lignes de planning");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
