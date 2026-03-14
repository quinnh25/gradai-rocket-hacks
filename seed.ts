import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  await prisma.user.create({
    data: { name: "Quinn", email: "qhague@gmail.com" }
  })
  console.log("✅ Quinn is now in the Cloud!")
}
main()