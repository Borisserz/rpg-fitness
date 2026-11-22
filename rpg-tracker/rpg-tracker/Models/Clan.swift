import Foundation

enum ClanRole: String, Codable {
    case leader = "Leader"
    case officer = "Officer"
    case member = "Member"
}

enum ClanBuffType: String, CaseIterable, Identifiable {
    case xpSurge = "xp_surge"
    case goldRush = "gold_rush"
    case warValor = "war_valor"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .xpSurge: return "CRUSADER'S EXP"
        case .goldRush: return "MERCHANT'S FORTUNE"
        case .warValor: return "VALOROUS SWORD"
        }
    }

    var bonusLabel: String {
        switch self {
        case .xpSurge: return "+20% XP"
        case .goldRush: return "+20% GOLD"
        case .warValor: return "+15% WAR PWR"
        }
    }

    var description: String {
        switch self {
        case .xpSurge: return "Boosts all XP from training, quests, and raids for 24h."
        case .goldRush: return "Boosts gold rewards from quests, training, and raids for 24h."
        case .warValor: return "Boosts Clan War skirmish power for all guild members for 24h."
        }
    }

    var cost: Int {
        switch self {
        case .xpSurge: return 500
        case .goldRush: return 500
        case .warValor: return 800
        }
    }

    var icon: String {
        switch self {
        case .xpSurge: return "bolt.fill"
        case .goldRush: return "centsign.circle.fill"
        case .warValor: return "flame.fill"
        }
    }
}

struct ClanMember: Codable, Identifiable {
    var id: String
    var username: String
    var level: Int
    var characterClass: CharacterClass
    var role: ClanRole
    var repsContributed: Int = 0
    var warAttacksUsed: Int = 0
    var warScoreContributed: Int = 0

    enum CodingKeys: String, CodingKey {
        case id, username, level, characterClass, role
        case repsContributed, warAttacksUsed, warScoreContributed
    }

    init(
        id: String,
        username: String,
        level: Int,
        characterClass: CharacterClass,
        role: ClanRole,
        repsContributed: Int = 0,
        warAttacksUsed: Int = 0,
        warScoreContributed: Int = 0
    ) {
        self.id = id
        self.username = username
        self.level = level
        self.characterClass = characterClass
        self.role = role
        self.repsContributed = repsContributed
        self.warAttacksUsed = warAttacksUsed
        self.warScoreContributed = warScoreContributed
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        username = try c.decodeIfPresent(String.self, forKey: .username) ?? "Member"
        level = try c.decodeIfPresent(Int.self, forKey: .level) ?? 1
        characterClass = try c.decodeIfPresent(CharacterClass.self, forKey: .characterClass) ?? .swordsman
        role = try c.decodeIfPresent(ClanRole.self, forKey: .role) ?? .member
        repsContributed = try c.decodeIfPresent(Int.self, forKey: .repsContributed) ?? 0
        warAttacksUsed = try c.decodeIfPresent(Int.self, forKey: .warAttacksUsed) ?? 0
        warScoreContributed = try c.decodeIfPresent(Int.self, forKey: .warScoreContributed) ?? 0
    }
}

enum ClanWarPhase: String, Codable {
    case searching
    case preparation
    case active
    case finished
}

struct ClanWar: Codable {
    var phase: ClanWarPhase = .searching
    var phaseEndsAt: Date
    var opponentClanId: String?
    var opponentClanName: String?
    var myClanScore: Int = 0
    var opponentClanScore: Int = 0
    
    // For backward compatibility / easy checks
    var isActive: Bool {
        phase == .active
    }
}

struct Clan: Codable, Identifiable {
    var id: String
    var name: String
    var description: String
    var emblem: String
    var leaderId: String
    var members: [ClanMember]
    /// Parallel id list for Firestore rules membership checks.
    var memberIds: [String] = []
    var trophies: Int = 1000
    var totalReps: Int = 0
    var level: Int = 1
    var xp: Int = 0
    var activeWar: ClanWar? = nil
    var treasuryGold: Int? = 0
    /// Server-managed active clan buff expiry timestamps (epoch milliseconds).
    var activeBuffs: [String: Double]? = nil

    enum CodingKeys: String, CodingKey {
        case id, name, description, emblem, leaderId, members, memberIds
        case trophies, totalReps, level, xp, activeWar, treasuryGold, activeBuffs
    }

    init(
        id: String,
        name: String,
        description: String,
        emblem: String,
        leaderId: String,
        members: [ClanMember],
        memberIds: [String] = [],
        trophies: Int = 1000,
        totalReps: Int = 0,
        level: Int = 1,
        xp: Int = 0,
        activeWar: ClanWar? = nil,
        treasuryGold: Int? = 0,
        activeBuffs: [String: Double]? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.emblem = emblem
        self.leaderId = leaderId
        self.members = members
        self.memberIds = memberIds
        self.trophies = trophies
        self.totalReps = totalReps
        self.level = level
        self.xp = xp
        self.activeWar = activeWar
        self.treasuryGold = treasuryGold
        self.activeBuffs = activeBuffs
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? "Guild"
        description = try c.decodeIfPresent(String.self, forKey: .description) ?? ""
        emblem = try c.decodeIfPresent(String.self, forKey: .emblem) ?? "shield.fill"
        leaderId = try c.decodeIfPresent(String.self, forKey: .leaderId) ?? ""
        members = try c.decodeIfPresent([ClanMember].self, forKey: .members) ?? []
        memberIds = try c.decodeIfPresent([String].self, forKey: .memberIds) ?? members.map(\.id)
        trophies = try c.decodeIfPresent(Int.self, forKey: .trophies) ?? 1000
        totalReps = try c.decodeIfPresent(Int.self, forKey: .totalReps) ?? 0
        level = try c.decodeIfPresent(Int.self, forKey: .level) ?? 1
        xp = try c.decodeIfPresent(Int.self, forKey: .xp) ?? 0
        activeWar = try c.decodeIfPresent(ClanWar.self, forKey: .activeWar)
        treasuryGold = try c.decodeIfPresent(Int.self, forKey: .treasuryGold)
        activeBuffs = try c.decodeIfPresent([String: Double].self, forKey: .activeBuffs)
    }

    func isBuffActive(_ buff: ClanBuffType, now: Date = Date()) -> Bool {
        guard let expiresAtMs = activeBuffs?[buff.rawValue] else { return false }
        return expiresAtMs > now.timeIntervalSince1970 * 1000.0
    }

    func buffRemainingText(_ buff: ClanBuffType, now: Date = Date()) -> String? {
        guard let expiresAtMs = activeBuffs?[buff.rawValue] else { return nil }
        let remainingSec = Int((expiresAtMs / 1000.0) - now.timeIntervalSince1970)
        guard remainingSec > 0 else { return nil }
        let hours = remainingSec / 3600
        let mins = (remainingSec % 3600) / 60
        return hours > 0 ? "\(hours)h \(mins)m" : "\(max(1, mins))m"
    }
    
    var maxMembers: Int {
        return 10 + (level - 1) * 5
    }
    
    var isFull: Bool {
        members.count >= maxMembers
    }

    mutating func syncMemberIds() {
        memberIds = members.map(\.id)
    }
}
