// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRandomnessProvider {
    // Must return a unique ID and fulfill asynchronously after this call returns.
    function requestRandomness() external returns (uint256 requestId);
}

/// @notice Free community draws. The provider must independently verify randomness.
/// @dev No production provider is bundled. Do not deploy with an untrusted provider.
contract LuckyProof {
    enum State { Open, Pending, Completed }
    struct Draw { address creator; uint64 deadline; State state; address winner; uint256 randomWord; }
    IRandomnessProvider public provider;
    address public immutable providerAdministrator;
    uint256 public drawCount;
    mapping(uint256 => Draw) public draws;
    mapping(uint256 => address[]) private participants;
    mapping(uint256 => mapping(address => bool)) public registered;
    mapping(uint256 => uint256) private requestDraw;
    mapping(uint256 => bool) private usedRequest;
    bool private requesting;
    event DrawCreated(uint256 indexed id, address indexed creator, uint64 deadline, string title);
    event ParticipantRegistered(uint256 indexed id, address indexed participant);
    event RandomnessRequested(uint256 indexed id, uint256 indexed requestId, bytes32 participantHash);
    event WinnerRecorded(uint256 indexed id, address indexed winner, uint256 randomWord, uint256 index);
    event ProviderConfigured(address indexed provider);
    constructor(address randomnessProvider) {
        providerAdministrator = msg.sender;
        if (randomnessProvider != address(0)) {
            require(randomnessProvider.code.length > 0, "Provider required");
            provider = IRandomnessProvider(randomnessProvider);
            emit ProviderConfigured(randomnessProvider);
        }
    }
    /// @notice Set the real provider once if deployment occurred before provider availability.
    function configureProvider(address randomnessProvider) external {
        require(msg.sender == providerAdministrator, "Administrator only");
        require(address(provider) == address(0), "Provider already configured");
        require(randomnessProvider.code.length > 0, "Provider required");
        provider = IRandomnessProvider(randomnessProvider);
        emit ProviderConfigured(randomnessProvider);
    }
    function createDraw(string calldata title, uint64 deadline) external returns (uint256 id) {
        require(deadline > block.timestamp && bytes(title).length > 0, "Invalid draw");
        id = ++drawCount; draws[id] = Draw(msg.sender, deadline, State.Open, address(0), 0);
        emit DrawCreated(id, msg.sender, deadline, title);
    }
    function register(uint256 id) external {
        Draw storage d = draws[id];
        require(d.creator != address(0) && d.state == State.Open && block.timestamp < d.deadline, "Registration closed");
        require(!registered[id][msg.sender], "Already registered");
        registered[id][msg.sender] = true; participants[id].push(msg.sender);
        emit ParticipantRegistered(id, msg.sender);
    }
    function selectWinner(uint256 id) external {
        require(address(provider) != address(0), "Randomness provider not configured");
        Draw storage d = draws[id];
        require(!requesting && d.creator != address(0) && d.state == State.Open && block.timestamp >= d.deadline, "Not ready");
        require(participants[id].length > 0, "No participants");
        d.state = State.Pending; requesting = true;
        uint256 requestId = provider.requestRandomness();
        require(!usedRequest[requestId], "Duplicate request");
        usedRequest[requestId] = true; requestDraw[requestId] = id; requesting = false;
        emit RandomnessRequested(id, requestId, keccak256(abi.encode(participants[id])));
    }
    function fulfillRandomness(uint256 requestId, uint256 randomWord) external {
        require(msg.sender == address(provider) && !requesting, "Provider only");
        uint256 id = requestDraw[requestId]; Draw storage d = draws[id];
        require(id != 0 && d.state == State.Pending, "Unknown request");
        uint256 index = randomWord % participants[id].length;
        d.state = State.Completed; d.randomWord = randomWord; d.winner = participants[id][index];
        delete requestDraw[requestId]; emit WinnerRecorded(id, d.winner, randomWord, index);
    }
    function getParticipants(uint256 id) external view returns (address[] memory) { return participants[id]; }
    function verifyWinner(uint256 id) external view returns (bool) {
        Draw storage d = draws[id];
        return d.state == State.Completed && d.winner == participants[id][d.randomWord % participants[id].length];
    }
}
