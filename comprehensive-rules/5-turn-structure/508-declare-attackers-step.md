# 508. Declare Attackers Step

Chapter: 5. Turn Structure
Source: Magic: The Gathering Comprehensive Rules (effective June 19, 2026)

## Rules

<a id="rule-508-1"></a>
508.1. First, the active player declares attackers. This turn-based action doesn’t use the stack. To declare attackers, the active player follows the steps below, in order. If at any point during the declaration of attackers, the active player is unable to comply with any of the steps listed below, the declaration is illegal; the game returns to the moment before the declaration (see rule [733](../7-additional-rules/733-handling-illegal-actions.md#rule-733), “Handling Illegal Actions”).

<a id="rule-508-1a"></a>
508.1a The active player chooses which creatures that they control, if any, will attack. The chosen creatures must be untapped, they can’t also be battles, and each one must either have haste or have been controlled by the active player continuously since the turn began.

<a id="rule-508-1b"></a>
508.1b If the defending player controls any planeswalkers, is the protector of any battles, or the game allows the active player to attack multiple other players, the active player announces which player, planeswalker, or battle each of the chosen creatures is attacking.

<a id="rule-508-1c"></a>
508.1c The active player checks each creature they control to see whether it’s affected by any restrictions (effects that say a creature can’t attack, or that it can’t attack unless some condition is met). If any restrictions are being disobeyed, the declaration of attackers is illegal.
Example: A player controls two creatures, each with a restriction that states “This creature can’t attack alone.” It’s legal to declare both as attackers.

<a id="rule-508-1d"></a>
508.1d The active player checks each creature they control to see whether it’s affected by any requirements (effects that say a creature attacks if able, or that it attacks if some condition is met). If the number of requirements that are being obeyed is fewer than the maximum possible number of requirements that could be obeyed without disobeying any restrictions, the declaration of attackers is illegal. If a creature can’t attack unless a player pays a cost, that player is not required to pay that cost, even if attacking with that creature would increase the number of requirements being obeyed. If a requirement that says a creature attacks if able during a certain turn refers to a turn with multiple combat phases, the creature attacks if able during each declare attackers step in that turn.
Example: A player controls two creatures: one that “attacks if able” and one with no abilities. An effect states “No more than one creature can attack each turn.” The only legal attack is for just the creature that “attacks if able” to attack. It’s illegal to attack with the other creature, attack with both, or attack with neither.

<a id="rule-508-1e"></a>
508.1e If any of the chosen creatures have banding or a “bands with other” ability, the active player announces which creatures, if any, are banded with which. (See rule [702.22](../7-additional-rules/702-keyword-abilities.md#rule-702-22), “Banding.”)

<a id="rule-508-1f"></a>
508.1f The active player taps the chosen creatures. Tapping a creature when it’s declared as an attacker isn’t a cost; attacking simply causes creatures to become tapped.

<a id="rule-508-1g"></a>
508.1g If there are any optional costs to attack with the chosen creatures (expressed as costs a player may pay “as” a creature attacks), the active player chooses which, if any, they will pay.

<a id="rule-508-1h"></a>
508.1h If any of the chosen creatures require paying costs to attack, or if any optional costs to attack were chosen, the active player determines the total cost to attack. Costs may include paying mana, tapping permanents, sacrificing permanents, discarding cards, and so on. Once the total cost is determined, it becomes “locked in.” If effects would change the total cost after this time, ignore this change.

<a id="rule-508-1i"></a>
508.1i If any of the costs require mana, the active player then has a chance to activate mana abilities (see rule [605](../6-spells-abilities-and-effects/605-mana-abilities.md#rule-605), “Mana Abilities”).

<a id="rule-508-1j"></a>
508.1j Once the player has enough mana in their mana pool, they pay all costs in any order. Partial payments are not allowed.

<a id="rule-508-1k"></a>
508.1k Each chosen creature still controlled by the active player becomes an attacking creature. It remains an attacking creature until it’s removed from combat or the combat phase ends, whichever comes first. See rule [506.4](506-combat-phase.md#rule-506-4).

<a id="rule-508-1m"></a>
508.1m Any abilities that trigger on attackers being declared trigger.

<a id="rule-508-2"></a>
508.2. Second, the active player gets priority. (See rule [117](../1-game-concepts/117-timing-and-priority.md#rule-117), “Timing and Priority.”)

<a id="rule-508-2a"></a>
508.2a Abilities that trigger on a creature attacking trigger only at the point the creature is declared as an attacker. They will not trigger if a creature attacks and then that creature’s characteristics change to match the ability’s trigger condition.
Example: A permanent has the ability “Whenever a green creature attacks, destroy that creature at end of combat.” If a blue creature attacks and is later turned green, the ability will not trigger.

<a id="rule-508-2b"></a>
508.2b Any abilities that triggered on attackers being declared or that triggered during the process described in rules [508.1](508-declare-attackers-step.md#rule-508-1) are put onto the stack before the active player gets priority; the order in which they triggered doesn’t matter. (See rule [603](../6-spells-abilities-and-effects/603-handling-triggered-abilities.md#rule-603), “Handling Triggered Abilities.”)

<a id="rule-508-3"></a>
508.3. Triggered abilities that trigger on attackers being declared may have different trigger conditions.

<a id="rule-508-3a"></a>
508.3a An ability that reads “Whenever [a creature] attacks, . . .” triggers if that creature is declared as an attacker. Similarly, “Whenever [a creature] attacks [a player, planeswalker, or battle], . . .” triggers if that creature is declared as an attacker attacking that player or permanent. Such abilities won’t trigger if a creature is put onto the battlefield attacking.

<a id="rule-508-3b"></a>
508.3b An ability that reads “Whenever [a player, planeswalker, or battle] is attacked, . . .” triggers if one or more creatures are declared as attackers attacking that player or permanent. It won’t trigger if a creature is put onto the battlefield attacking that player or permanent.

<a id="rule-508-3c"></a>
508.3c An ability that reads “Whenever [a player] attacks with [a creature], . . .” triggers if a creature that player controls is declared as an attacker.

<a id="rule-508-3d"></a>
508.3d An ability that reads “Whenever [a player] attacks, . . .” triggers if one or more creatures that player controls are declared as attackers.

<a id="rule-508-3e"></a>
508.3e An ability that reads “Whenever [a player] attacks [another player], . . .” triggers if one or more creatures the first player controls are declared as attackers attacking the second player. It won’t trigger if a creature is put onto the battlefield attacking or if a creature attacks a planeswalker or a battle.

<a id="rule-508-3f"></a>
508.3f An ability that reads “Whenever [a creature] attacks and isn’t blocked, . . .” triggers during the declare blockers step, not the declare attackers step. See rule [509.3g](509-declare-blockers-step.md#rule-509-3g).

<a id="rule-508-4"></a>
508.4. If a creature is put onto the battlefield attacking, its controller chooses which defending player, planeswalker a defending player controls, or battle a defending player protects it’s attacking as it enters the battlefield (unless the effect that put it onto the battlefield specifies what it’s attacking). Similarly, if an effect states that a creature is attacking, its controller chooses which defending player, planeswalker a defending player controls, or battle a defending player protects it’s attacking (unless the effect has already specified). Such creatures are “attacking” but, for the purposes of trigger events and effects, they never “attacked.” They remain attacking creatures until they’re removed from combat or the combat phase ends, whichever comes first.

<a id="rule-508-4a"></a>
508.4a If a creature would be put onto the battlefield attacking a certain player, and that player is no longer in the game, the creature is put onto the battlefield but is never considered an attacking creature. The same is true if a creature would be put onto the battlefield attacking a planeswalker or battle and that permanent is no longer on the battlefield, is no longer a planeswalker or battle, is a planeswalker that is no longer controlled by a defending player, or is a battle that is no longer protected by a defending player.

<a id="rule-508-4b"></a>
508.4b If the effect that states a creature is attacking specifies it’s attacking a certain player, and that player is no longer in the game when the effect resolves, the creature doesn’t become an attacking creature. The same is true if the effect specifies a creature is attacking a planeswalker or battle and, when the effect resolves, that permanent is no longer on the battlefield, is no longer a planeswalker or battle, is a planeswalker that is no longer controlled by a defending player, or is a battle that is no longer protected by a defending player.

<a id="rule-508-4c"></a>
508.4c A creature that’s put onto the battlefield attacking or that is stated to be attacking isn’t affected by requirements or restrictions that apply to the declaration of attackers.

<a id="rule-508-4d"></a>
508.4d A creature that’s put onto the battlefield attacking during the declare blockers step, combat damage step, or end of combat step enters the battlefield as an unblocked creature. It remains unblocked until it is removed from combat, an effect says it becomes blocked, or the combat phase ends, whichever comes first.

<a id="rule-508-5"></a>
508.5. If an ability of an attacking creature refers to a defending player, or a spell or ability refers to both an attacking creature and a defending player, then unless otherwise specified, the defending player it’s referring to is the player that creature is attacking, the controller of the planeswalker that creature is attacking, or the protector of the battle that creature is attacking. If that creature is no longer attacking, the defending player it’s referring to is the player that creature was attacking before it was removed from combat, the controller of the planeswalker that creature was attacking before it was removed from combat, or the protector of the battle that creature was attacking before it was removed from combat.

<a id="rule-508-5a"></a>
508.5a In a multiplayer game, any rule, object, or effect that refers to a “defending player” refers to one specific defending player, not to all of the defending players. If a spell or ability could apply to multiple attacking creatures, the appropriate defending player is individually determined for each of those attacking creatures. If there are multiple defending players that could be chosen, the controller of the spell or ability chooses one.

<a id="rule-508-6"></a>
508.6. A player is “attacking [a player]” if the first player controls a creature that is attacking the second player. A player has “attacked [a player]” if the first player declared one or more creatures as attackers attacking the second player.

<a id="rule-508-7"></a>
508.7. Some cards allow a player to reselect which player, planeswalker, or battle a creature is attacking.

<a id="rule-508-7a"></a>
508.7a The attacking creature isn’t removed from combat and it isn’t considered to have attacked a second time. That creature is attacking the reselected player or permanent, but it’s still considered to have attacked the player or permanent chosen as it was declared as an attacker.

<a id="rule-508-7b"></a>
508.7b While reselecting which player, planeswalker, or battle a creature is attacking, that creature isn’t affected by requirements or restrictions that apply to the declaration of attackers.

<a id="rule-508-7c"></a>
508.7c The reselected player, planeswalker, or battle must be an opponent of the attacking creature’s controller, a planeswalker controlled by an opponent of the attacking creature’s controller, or a battle protected by an opponent of the attacking creature’s controller.

<a id="rule-508-7d"></a>
508.7d In a multiplayer game not using the attack multiple players option (see rule [802](../8-multiplayer-rules/802-attack-multiple-players-option.md#rule-802)), the reselected player, planeswalker, or battle must be the chosen defending player, a planeswalker controlled by that player, or a battle protected by that player.

<a id="rule-508-7e"></a>
508.7e In a multiplayer game using the limited range of influence option (see rule [801](../8-multiplayer-rules/801-limited-range-of-influence-option.md#rule-801)), the reselected player, planeswalker, or battle must be within the range of influence of the attacking creature’s controller. In the case of a battle, the battle’s protector must also be within the range of influence of the attacking creature’s controller.

<a id="rule-508-8"></a>
508.8. If no creatures are declared as attackers or put onto the battlefield attacking, skip the declare blockers and combat damage steps.
