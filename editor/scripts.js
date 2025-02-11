const { createApp, computed } = Vue

// Languages configuration
const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' }
]

// Version configuration
const CURRENT_VERSION = 1

// Migration handlers
const MIGRATIONS = {
  // Example migration from version 0 to 1
  1: (data) => {
    // If importing a file without version, treat it as version 0
    // Add any necessary transformations here
    return data
  }
  // Add more migrations as needed:
  // 2: (data) => { /* migrate from 1 to 2 */ },
  // 3: (data) => { /* migrate from 2 to 3 */ },
}

// Auto-resizing Textarea Component
const AutoTextarea = {
  template: '#auto-textarea',
  props: {
    modelValue: String,
    placeholder: String,
    multiline: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      height: 0
    }
  },
  mounted() {
    this.adjustHeight()
    // Watch for external content changes
    this.$watch('modelValue', this.adjustHeight)
  },
  methods: {
    onInput(e) {
      this.$emit('update:modelValue', e.target.value)
      this.adjustHeight()
    },
    adjustHeight() {
      const textarea = this.$refs.textarea
      if (!textarea) return

      // Reset height to get the correct scrollHeight
      textarea.style.height = 'auto'

      // Get the scroll height and add a small buffer
      const scrollHeight = textarea.scrollHeight
      const newHeight = scrollHeight + 2

      // Set the new height
      textarea.style.height = `${newHeight}px`
      this.height = newHeight
    }
  }
}

// Translatable Field Component
const TranslatableField = {
  components: {
    'auto-textarea': AutoTextarea
  },
  template: '#translatable-field',
  props: {
    modelValue: {
      type: Object,
      default: () => ({})
    },
    label: {
      type: String,
      required: true
    },
    placeholder: {
      type: String,
      default: ''
    },
    multiline: {
      type: Boolean,
      default: false
    },
    rows: {
      type: Number,
      default: 3
    },
  },
  inject: ['selectedLanguage', 'languages', 'campaignData'],
  computed: {
    translations: {
      get() {
        return this.modelValue || {}
      },
      set(value) {
        this.$emit('update:modelValue', value)
      }
    },
    selectedLanguageName() {
      const lang = this.languages.find(l => l.code === this.selectedLanguage)
      return lang ? lang.name : ''
    }
  }
}

// Selector Field Component
const SelectorField = {
  template: '#selector-field',
  props: {
    modelValue: {
      type: Array,
      default: () => []
    },
    items: {
      type: Array,
      default: () => []
    },
    label: {
      type: String,
      required: true
    },
    itemType: {
      type: String,
      required: true
    }
  },
  computed: {
    componentId() {
      return `selector-${this.label.toLowerCase().replace(/\s+/g, '-')}`
    },
    selectedItems: {
      get() {
        return this.modelValue
      },
      set(value) {
        this.$emit('update:modelValue', value)
      }
    }
  },
  methods: {
    getItemLabel(item) {
      if (this.itemType === 'clue') {
        return item.text?.en || item.id
      }
      return item.name || item.id
    }
  }
}

// Add the Modal Dialog Component
const ModalDialog = {
  template: '#modal-dialog',
  props: {
    show: Boolean,
    title: String,
    selectedLanguage: String,
    languages: Array
  },
  emits: ['close', 'update:selectedLanguage']
}

// Dependency Item Component
const DependencyItem = {
  name: 'dependency-item',
  template: '#dependency-item',
  props: {
    itemId: {
      type: String,
      required: true
    },
    itemType: {
      type: String,
      required: true
    },
    allConditionals: {
      type: Array,
      default: () => []
    },
    getItemLabel: {
      type: Function,
      required: true
    }
  },
  inject: ['campaignData'],
  data() {
    return {
      isExpanded: false
    }
  },
  computed: {
    label() {
      return this.getItemLabel(this.itemId)
    },
    dependencies() {
      return this.allConditionals.filter(cond => {
        if (this.itemType === 'clue') {
          return cond.unlockedClues.includes(this.itemId)
        } else {
          return cond.unlockedCharacters.includes(this.itemId)
        }
      })
    },
    hasDependencies() {
      return this.dependencies.length > 0
    }
  },
  methods: {
    getCharacterName(characterId) {
      const character = this.campaignData.characters.find(c => c.id === characterId)
      return character ? (character.name || character.id) : 'Unknown Character'
    }
  }
}

const app = createApp({
  components: {
    'translatable-field': TranslatableField,
    'selector-field': SelectorField,
    'modal-dialog': ModalDialog,
    'dependency-item': DependencyItem,
    'auto-textarea': AutoTextarea
  },
  provide() {
    return {
      selectedLanguage: computed(() => this.selectedLanguage),
      languages: LANGUAGES,
      campaignData: computed(() => this.campaignData)
    }
  },
  data() {
    return {
      message: 'Welcome to the Campaign Editor',
      campaignData: null,
      currentTab: 'General',
      tabs: ['General', 'Characters', 'Clues', 'Conditionals', 'JSON'],
      selectedLanguage: 'en',
      languages: LANGUAGES,
      showClueModal: false,
      editingClue: null,
      editingClueIndex: -1,
      showCharacterModal: false,
      editingCharacter: null,
      editingCharacterIndex: -1,
      showConditionalModal: false,
      editingConditional: null,
      editingConditionalIndex: -1,
      importUrl: 'https://raw.githubusercontent.com/acroca/mystery_solver_campaigns/refs/heads/main/secret_formula.json',
      isImporting: false
    }
  },
  computed: {
    prettyJson() {
      // Create a deep copy without _key fields
      const cleanData = this.cleanDataForExport(this.campaignData)
      return JSON.stringify(cleanData, null, 2)
    },
    initialCharacters: {
      get() {
        return this.campaignData.initialCharacters || []
      },
      set(value) {
        this.campaignData.initialCharacters = value
      }
    }
  },
  methods: {
    triggerFileInput() {
      this.$refs.fileInput.click()
    },
    handleFileImport(event) {
      const file = event.target.files[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          let importedData = JSON.parse(e.target.result)

          // Handle version migrations
          const fileVersion = importedData.version || 0
          if (fileVersion < CURRENT_VERSION) {
            // Apply migrations sequentially
            for (let v = fileVersion + 1; v <= CURRENT_VERSION; v++) {
              if (MIGRATIONS[v]) {
                console.log(`Migrating from version ${v-1} to ${v}`)
                importedData = MIGRATIONS[v](importedData)
              }
            }
          } else if (fileVersion > CURRENT_VERSION) {
            throw new Error(`File version ${fileVersion} is newer than the editor version ${CURRENT_VERSION}`)
          }

          // Set the current version
          importedData.version = CURRENT_VERSION

          // Add new _key fields to all items
          importedData = this.addKeysToImportedData(importedData)

          this.campaignData = importedData

          // Initialize empty fields if they don't exist
          if (!this.campaignData.title) this.campaignData.title = {}
          if (!this.campaignData.introMessage) this.campaignData.introMessage = {}
          if (!this.campaignData.characters) this.campaignData.characters = []
          if (!this.campaignData.clues) this.campaignData.clues = []
          if (!this.campaignData.conditionals) this.campaignData.conditionals = []
          if (!this.campaignData.initialCharacters) this.campaignData.initialCharacters = []

          this.message = 'Campaign file imported successfully!'
          this.currentTab = 'General'
        } catch (error) {
          this.message = `Error importing campaign file: ${error.message}`
          console.error('Import error:', error)
        }
      }
      reader.readAsText(file)
    },
    exportCampaign() {
      const dataToExport = {
        version: CURRENT_VERSION,
        ...(this.cleanDataForExport(this.campaignData) || { message: "Empty campaign" })
      }

      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = 'campaign.json'
      document.body.appendChild(a)
      a.click()

      URL.revokeObjectURL(url)
      document.body.removeChild(a)
    },
    copyJsonToClipboard() {
      navigator.clipboard.writeText(this.prettyJson)
        .then(() => {
          // Optional: Add some visual feedback that copy succeeded
          const btn = event.target
          const originalText = btn.textContent
          btn.textContent = 'Copied!'
          setTimeout(() => {
            btn.textContent = originalText
          }, 2000)
        })
        .catch(err => {
          console.error('Failed to copy text: ', err)
        })
    },
    addCharacter() {
      if (!this.campaignData.characters) {
        this.campaignData.characters = []
      }

      const newCharacter = {
        _key: crypto.randomUUID(),
        id: this.generateUniqueCharacterId(),
        name: '',
        intro: {},
        description: {},
        portraitPrompt: '',
        isInitiallyAvailable: false
      }

      this.campaignData.characters.push(newCharacter)
    },
    deleteCharacter(index) {
      this.campaignData.characters.splice(index, 1)
    },
    generateUniqueCharacterId() {
      const base = 'character'
      let id = base
      let counter = 1

      while (this.campaignData.characters.some(char => char.id === id)) {
        id = `${base}_${counter}`
        counter++
      }

      return id
    },
    validateAndUpdateId(character) {
      // Remove any characters that aren't lowercase letters, numbers, or underscores
      character.id = character.id.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    },
    addClue() {
      if (!this.campaignData.clues) {
        this.campaignData.clues = []
      }

      const newClue = {
        _key: crypto.randomUUID(),
        id: this.generateUniqueClueId(),
        text: {},
        description: {}
      }

      this.campaignData.clues.push(newClue)
    },
    deleteClue(index) {
      this.campaignData.clues.splice(index, 1)
    },
    generateUniqueClueId() {
      const base = 'clue'
      let id = base
      let counter = 1

      while (this.campaignData.clues?.some(clue => clue.id === id)) {
        id = `${base}_${counter}`
        counter++
      }

      return id
    },
    validateAndUpdateClueId(clue) {
      // Remove any characters that aren't lowercase letters, numbers, or underscores
      clue.id = clue.id.toLowerCase().replace(/[^a-z0-9_]/g, '_')
    },
    addConditional() {
      if (!this.campaignData.conditionals) {
        this.campaignData.conditionals = []
      }

      const newConditional = {
        _key: crypto.randomUUID(),
        characterId: '',
        requiredClues: [],
        requiredCharacters: [],
        condition: '',
        revealedInformation: '',
        unlockedClues: [],
        unlockedCharacters: []
      }

      this.campaignData.conditionals.push(newConditional)
    },
    deleteConditional(index) {
      this.campaignData.conditionals.splice(index, 1)
    },
    applyMigration(data, fromVersion, toVersion) {
      if (!MIGRATIONS[toVersion]) {
        throw new Error(`No migration defined for version ${toVersion}`)
      }
      return MIGRATIONS[toVersion](data)
    },
    openClueForm(clue = null) {
      if (clue) {
        // Edit existing clue
        this.editingClueIndex = this.campaignData.clues.findIndex(c => c._key === clue._key)
        this.editingClue = JSON.parse(JSON.stringify(clue)) // Deep copy
      } else {
        // New clue
        this.editingClueIndex = -1
        this.editingClue = {
          _key: crypto.randomUUID(),
          id: this.generateUniqueClueId(),
          text: {},
          description: {}
        }
      }
      this.showClueModal = true
    },
    closeClueForm() {
      this.showClueModal = false
      this.editingClue = null
      this.editingClueIndex = -1
    },
    saveClue() {
      if (this.editingClueIndex >= 0) {
        // Update existing clue
        this.campaignData.clues[this.editingClueIndex] = this.editingClue
      } else {
        // Add new clue
        this.campaignData.clues.push(this.editingClue)
      }
      this.closeClueForm()
    },
    deleteClue(clue) {
      const index = this.campaignData.clues.findIndex(c => c._key === clue._key)
      if (index >= 0) {
        this.campaignData.clues.splice(index, 1)
      }
    },
    openCharacterForm(character = null) {
      if (character) {
        // Edit existing character
        this.editingCharacterIndex = this.campaignData.characters.findIndex(c => c._key === character._key)
        this.editingCharacter = JSON.parse(JSON.stringify(character)) // Deep copy
      } else {
        // New character
        this.editingCharacterIndex = -1
        this.editingCharacter = {
          _key: crypto.randomUUID(),
          id: this.generateUniqueCharacterId(),
          name: '',
          intro: {},
          description: {},
          portraitPrompt: '',
          portrait: ''
        }
      }
      this.showCharacterModal = true
    },
    closeCharacterForm() {
      this.showCharacterModal = false
      this.editingCharacter = null
      this.editingCharacterIndex = -1
    },
    saveCharacter() {
      if (this.editingCharacterIndex >= 0) {
        // Update existing character
        this.campaignData.characters[this.editingCharacterIndex] = this.editingCharacter
      } else {
        // Add new character
        this.campaignData.characters.push(this.editingCharacter)
      }
      this.closeCharacterForm()
    },
    deleteCharacter(character) {
      const index = this.campaignData.characters.findIndex(c => c._key === character._key)
      if (index >= 0) {
        this.campaignData.characters.splice(index, 1)
      }
    },
    getCharacterName(characterId) {
      const character = this.campaignData.characters.find(c => c.id === characterId)
      return character ? (character.name || character.id) : 'Unknown Character'
    },
    openConditionalForm(conditional = null) {
      if (conditional) {
        // Edit existing conditional
        this.editingConditionalIndex = this.campaignData.conditionals.findIndex(c => c._key === conditional._key)
        this.editingConditional = JSON.parse(JSON.stringify(conditional)) // Deep copy
      } else {
        // New conditional
        this.editingConditionalIndex = -1
        this.editingConditional = {
          _key: crypto.randomUUID(),
          characterId: '',
          requiredClues: [],
          requiredCharacters: [],
          condition: '',
          revealedInformation: '',
          unlockedClues: [],
          unlockedCharacters: []
        }
      }
      this.showConditionalModal = true
    },
    closeConditionalForm() {
      this.showConditionalModal = false
      this.editingConditional = null
      this.editingConditionalIndex = -1
    },
    saveConditional() {
      if (this.editingConditionalIndex >= 0) {
        // Update existing conditional
        this.campaignData.conditionals[this.editingConditionalIndex] = this.editingConditional
      } else {
        // Add new conditional
        this.campaignData.conditionals.push(this.editingConditional)
      }
      this.closeConditionalForm()
    },
    deleteConditional(conditional) {
      const index = this.campaignData.conditionals.findIndex(c => c._key === conditional._key)
      if (index >= 0) {
        this.campaignData.conditionals.splice(index, 1)
      }
    },
    cleanDataForExport(data) {
      if (!data) return data

      // Deep clone the data
      const cleanData = JSON.parse(JSON.stringify(data))

      // Remove _key fields from all arrays
      if (cleanData.characters) {
        cleanData.characters.forEach(char => delete char._key)
      }
      if (cleanData.clues) {
        cleanData.clues.forEach(clue => delete clue._key)
      }
      if (cleanData.conditionals) {
        cleanData.conditionals.forEach(cond => delete cond._key)
      }

      return cleanData
    },
    addKeysToImportedData(data) {
      if (data.characters) {
        data.characters.forEach(char => char._key = crypto.randomUUID())
      }
      if (data.clues) {
        data.clues.forEach(clue => clue._key = crypto.randomUUID())
      }
      if (data.conditionals) {
        data.conditionals.forEach(cond => cond._key = crypto.randomUUID())
      }
      return data
    },
    getClueText(clueId) {
      const clue = this.campaignData.clues.find(c => c.id === clueId)
      return clue ? (clue.text?.en || clue.id) : clueId
    },
    handlePortraitUpload(event) {
      const file = event.target.files[0]
      if (!file) return

      // Check file type
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file')
        return
      }

      // Check file size (e.g., 2MB limit)
      const maxSize = 2 * 1024 * 1024 // 2MB
      if (file.size > maxSize) {
        alert('Image size should be less than 2MB')
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        // Resize image before storing
        this.resizeImage(e.target.result, 256, 256).then(resizedImage => {
          this.editingCharacter.portrait = resizedImage
        })
      }
      reader.readAsDataURL(file)
    },
    removePortrait() {
      this.editingCharacter.portrait = ''
    },
    resizeImage(base64, maxWidth, maxHeight) {
      return new Promise((resolve) => {
        const img = new Image()
        img.src = base64
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          // Calculate new dimensions maintaining aspect ratio
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width)
              width = maxWidth
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height)
              height = maxHeight
            }
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)

          // Get the resized image as base64
          resolve(canvas.toDataURL('image/jpeg', 0.85)) // Use JPEG with 85% quality for better compression
        }
      })
    },
    async importFromUrl() {
      if (!this.importUrl || this.isImporting) return

      this.isImporting = true
      this.message = 'Importing campaign from URL...'

      try {
        const response = await fetch(this.importUrl)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const importedData = await response.json()

        // Handle version migrations
        const fileVersion = importedData.version || 0
        if (fileVersion < CURRENT_VERSION) {
          // Apply migrations sequentially
          for (let v = fileVersion + 1; v <= CURRENT_VERSION; v++) {
            if (MIGRATIONS[v]) {
              console.log(`Migrating from version ${v-1} to ${v}`)
              importedData = MIGRATIONS[v](importedData)
            }
          }
        } else if (fileVersion > CURRENT_VERSION) {
          throw new Error(`File version ${fileVersion} is newer than the editor version ${CURRENT_VERSION}`)
        }

        // Set the current version
        importedData.version = CURRENT_VERSION

        // Add new _key fields to all items
        const processedData = this.addKeysToImportedData(importedData)

        // Initialize empty fields if they don't exist
        if (!processedData.title) processedData.title = {}
        if (!processedData.introMessage) processedData.introMessage = {}
        if (!processedData.characters) processedData.characters = []
        if (!processedData.clues) processedData.clues = []
        if (!processedData.conditionals) processedData.conditionals = []
        if (!processedData.initialCharacters) processedData.initialCharacters = []

        this.campaignData = processedData
        this.message = 'Campaign imported successfully from URL!'
        this.currentTab = 'General'
        this.importUrl = '' // Clear the URL input
      } catch (error) {
        this.message = `Error importing campaign from URL: ${error.message}`
        console.error('URL import error:', error)
      } finally {
        this.isImporting = false
      }
    },
  }
})

app.mount('#app')
