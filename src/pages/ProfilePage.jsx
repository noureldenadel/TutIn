import { useState, useEffect } from 'react'
import { User, Camera, Save, Mail, Target, BookOpen } from 'lucide-react'

function ProfilePage() {
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        avatar: null,
        learningGoal: '',
        bio: ''
    })
    const [isSaving, setIsSaving] = useState(false)
    const [saveMessage, setSaveMessage] = useState('')

    useEffect(() => {
        // Load profile from localStorage
        const saved = localStorage.getItem('user_profile')
        if (saved) {
            try {
                setProfile(JSON.parse(saved))
            } catch (e) {
                console.error('Failed to load profile:', e)
            }
        }
    }, [])

    const handleAvatarChange = (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
            setProfile(prev => ({ ...prev, avatar: event.target.result }))
        }
        reader.readAsDataURL(file)
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            localStorage.setItem('user_profile', JSON.stringify(profile))
            setSaveMessage('Profile saved successfully!')
            setTimeout(() => setSaveMessage(''), 3000)
        } catch (e) {
            console.error('Failed to save profile:', e)
            setSaveMessage('Failed to save profile')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="py-6 max-w-2xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-light-text-primary dark:text-dark-text-primary flex items-center gap-3">
                    <User className="w-7 h-7 text-primary" />
                    Profile
                </h1>
                <p className="text-light-text-secondary dark:text-dark-text-secondary mt-1">
                    Manage your personal information and preferences
                </p>
            </div>

            {/* Profile Card */}
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border overflow-hidden">
                {/* Avatar Section */}
                <div className="bg-gradient-to-r from-primary to-primary-dark h-32 relative">
                    <div className="absolute -bottom-12 left-6">
                        <div className="relative">
                            {profile.avatar ? (
                                <img
                                    src={profile.avatar}
                                    alt="Profile"
                                    className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-dark-surface"
                                />
                            ) : (
                                <div className="w-24 h-24 rounded-full bg-light-surface dark:bg-dark-bg border-4 border-white dark:border-dark-surface flex items-center justify-center">
                                    <User className="w-10 h-10 text-light-text-secondary dark:text-dark-text-secondary" />
                                </div>
                            )}
                            <label className="absolute bottom-0 right-0 p-2 bg-primary rounded-full cursor-pointer hover:bg-primary-dark transition-colors">
                                <Camera className="w-4 h-4 text-white" />
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <div className="pt-16 p-6 space-y-6">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2">
                            Display Name
                        </label>
                        <input
                            type="text"
                            value={profile.name}
                            onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Enter your name"
                            className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:ring-2 focus:ring-primary outline-none"
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2 flex items-center gap-2">
                            <Mail className="w-4 h-4" />
                            Email (optional)
                        </label>
                        <input
                            type="email"
                            value={profile.email}
                            onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                            placeholder="your@email.com"
                            className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:ring-2 focus:ring-primary outline-none"
                        />
                    </div>

                    {/* Learning Goal */}
                    <div>
                        <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2 flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            Learning Goal
                        </label>
                        <select
                            value={profile.learningGoal}
                            onChange={(e) => setProfile(prev => ({ ...prev, learningGoal: e.target.value }))}
                            className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:ring-2 focus:ring-primary outline-none"
                        >
                            <option value="">Select a goal</option>
                            <option value="casual">Casual Learner - 1-2 hours/week</option>
                            <option value="regular">Regular Learner - 3-5 hours/week</option>
                            <option value="dedicated">Dedicated Learner - 5-10 hours/week</option>
                            <option value="intensive">Intensive Learner - 10+ hours/week</option>
                        </select>
                    </div>

                    {/* Bio */}
                    <div>
                        <label className="block text-sm font-medium text-light-text-primary dark:text-dark-text-primary mb-2 flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            About Me
                        </label>
                        <textarea
                            value={profile.bio}
                            onChange={(e) => setProfile(prev => ({ ...prev, bio: e.target.value }))}
                            placeholder="Tell us about yourself and your learning interests..."
                            rows={4}
                            className="w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface focus:ring-2 focus:ring-primary outline-none resize-none"
                        />
                    </div>

                    {/* Save Button */}
                    <div className="flex items-center justify-between pt-4">
                        <div className="text-sm text-green-500 font-medium">
                            {saveMessage}
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="btn-primary flex items-center gap-2"
                        >
                            <Save className="w-5 h-5" />
                            {isSaving ? 'Saving...' : 'Save Profile'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Info Note */}
            <p className="mt-4 text-sm text-light-text-secondary dark:text-dark-text-secondary text-center">
                Your profile is stored locally on this device.
            </p>
        </div>
    )
}

export default ProfilePage
