import { Users } from "lucide-react"

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-gray-900 text-gray-300 print:hidden">
      <div className="container mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold leading-tight">SimuClient</p>
            <p className="text-xs text-gray-400">by Novalys Conseil</p>
          </div>
        </div>

        <nav className="flex space-x-6 text-sm">
          <a href="/" className="hover:text-white transition-colors">Accueil</a>
          <a href="/history" className="hover:text-white transition-colors">Historique</a>
          <a href="/assistant" className="hover:text-white transition-colors">Assistant</a>
        </nav>

        <p className="text-xs text-gray-500">&copy; {currentYear} Novalys Conseil</p>
      </div>
    </footer>
  )
}
