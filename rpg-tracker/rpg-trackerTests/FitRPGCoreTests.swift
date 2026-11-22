import XCTest
@testable import rpg_tracker

@MainActor
final class FitRPGCoreTests: XCTestCase {

    func testFindItemResolvesAllSlotsAndRejectsUnknown() {
        XCTAssertEqual(EquipmentItem.findItem(by: "w_arch_1")?.slot, .weapon)
        XCTAssertEqual(EquipmentItem.findItem(by: "a_mage_1")?.slot, .armor)
        XCTAssertEqual(EquipmentItem.findItem(by: "rng_com_1")?.slot, .ring)
        XCTAssertEqual(EquipmentItem.findItem(by: "amu_com_1")?.slot, .amulet)
        XCTAssertNil(EquipmentItem.findItem(by: "nonexistent_item_999"))
    }

    func testCharacterDecodesStrippedPublicLeaderboardPayload() throws {
        let json = """
        {
            "id": "u_pub_1",
            "username": "ShadowArcher",
            "selectedClass": "Archer",
            "avatarName": "avatar_archer",
            "currentLevel": 7,
            "pvpTrophies": 1250,
            "pvpWins": 9,
            "classTrophies": { "Archer": 1250 },
            "stats": { "totalSquats": 140, "totalPushups": 10, "totalPullups": 0, "totalDips": 0 },
            "progressions": { "Archer": { "level": 7, "xp": 40, "totalReps": 140, "storyStage": 4 } }
        }
        """.data(using: .utf8)!

        let decoded = try JSONDecoder().decode(Character.self, from: json)
        XCTAssertEqual(decoded.id, "u_pub_1")
        XCTAssertEqual(decoded.username, "ShadowArcher")
        XCTAssertEqual(decoded.selectedClass, .archer)
        XCTAssertEqual(decoded.level, 7)
        XCTAssertEqual(decoded.stats.totalReps, 150)
        XCTAssertEqual(decoded.unwrappedPvPTrophies, 1250)
    }

    func testClanDecodesStrippedLeaderboardAndActiveBuffs() throws {
        let futureMs = Date().timeIntervalSince1970 * 1000 + 3_600_000
        let json = """
        {
            "id": "clan_1",
            "name": "Iron Guild",
            "emblem": "shield.fill",
            "trophies": 1420,
            "totalReps": 800,
            "level": 3,
            "xp": 120,
            "leaderId": "u1",
            "activeBuffs": { "xp_surge": \(futureMs) },
            "members": [
                { "id": "u1", "username": "Boris", "level": 5, "characterClass": "Swordsman", "role": "Leader" }
            ]
        }
        """.data(using: .utf8)!

        let clan = try JSONDecoder().decode(Clan.self, from: json)
        XCTAssertEqual(clan.id, "clan_1")
        XCTAssertEqual(clan.level, 3)
        XCTAssertTrue(clan.isBuffActive(.xpSurge))
        XCTAssertFalse(clan.isBuffActive(.goldRush))
    }

    func testCharacterStatPointAllocateAndRollback() {
        var hero = Character(id: "u1", username: "Hero", selectedClass: .swordsman, statPoints: 2)
        hero.allocateStatPoint(stat: "STR")
        XCTAssertEqual(hero.statPoints, 1)
        XCTAssertEqual(hero.baseStrength, 11)

        hero.rollbackStatPoint(stat: "STR")
        XCTAssertEqual(hero.statPoints, 2)
        XCTAssertEqual(hero.baseStrength, 10)
    }

    func testDailyQuestServerClaimRecognition() {
        let todayUtc = DailyQuestProgressStore.utcDayKey()
        let hero = Character(
            id: "u1",
            username: "Hero",
            selectedClass: .archer,
            claimedDailyQuests: [todayUtc: ["q_squat_15"]]
        )
        XCTAssertTrue(DailyQuestProgressStore.isClaimed(questId: "q_squat_15", character: hero))
        XCTAssertFalse(DailyQuestProgressStore.isClaimed(questId: "q_push_10", character: hero))
    }
}
