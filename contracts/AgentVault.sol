// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IAgentSwapAdapter {
    function swap(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint256 minOut, uint256 deadline)
        external payable returns (uint256 amountOut);
}

/// @notice Non-custodial execution vault retained by the ERC-8004 owner who created it.
/// @dev Adapters receive only the exact input amount and must return output to this vault.
contract AgentVault {
    error Unauthorized();
    error Paused();
    error InvalidAddress();
    error InvalidPair();
    error AdapterNotAllowed();
    error TokenNotAllowed();
    error DeadlineExpired();
    error TradeLimitExceeded();
    error DailyLimitExceeded();
    error MinimumOutputNotMet();
    error TransferFailed();
    error Reentrancy();

    struct Policy {
        uint256 maxPerTrade;
        uint256 dailyLimit;
        uint256 spentToday;
        uint64 day;
    }

    address public immutable owner;
    uint256 public immutable agentId;
    address public executor;
    bool public paused;
    uint256 private locked = 1;

    mapping(address => bool) public allowedAdapter;
    mapping(address => bool) public allowedOutputToken;
    mapping(address => Policy) public policies;

    event Funded(address indexed sender, uint256 amount);
    event ExecutorChanged(address indexed executor);
    event AdapterChanged(address indexed adapter, bool allowed);
    event OutputTokenChanged(address indexed token, bool allowed);
    event PolicyChanged(address indexed token, uint256 maxPerTrade, uint256 dailyLimit);
    event SwapExecuted(address indexed adapter, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event PausedChanged(bool paused);

    constructor(address initialOwner, uint256 identityId, address initialExecutor) {
        if (initialOwner == address(0)) revert InvalidAddress();
        owner = initialOwner;
        agentId = identityId;
        executor = initialExecutor;
    }

    receive() external payable { emit Funded(msg.sender, msg.value); }

    modifier onlyOwner() { if (msg.sender != owner) revert Unauthorized(); _; }
    modifier onlyExecutor() { if (msg.sender != executor || executor == address(0)) revert Unauthorized(); _; }
    modifier nonReentrant() { if (locked != 1) revert Reentrancy(); locked = 2; _; locked = 1; }

    function setExecutor(address next) external onlyOwner {
        executor = next;
        emit ExecutorChanged(next);
    }
    function setPaused(bool value) external onlyOwner { paused = value; emit PausedChanged(value); }

    function setAdapter(address adapter, bool allowed) external onlyOwner {
        if (adapter == address(0) || (allowed && adapter.code.length == 0)) revert InvalidAddress();
        allowedAdapter[adapter] = allowed;
        emit AdapterChanged(adapter, allowed);
    }

    function setOutputToken(address token, bool allowed) external onlyOwner {
        if (allowed && token != address(0) && token.code.length == 0) revert InvalidAddress();
        allowedOutputToken[token] = allowed;
        emit OutputTokenChanged(token, allowed);
    }

    function setPolicy(address token, uint256 maxPerTrade, uint256 dailyLimit) external onlyOwner {
        if (token != address(0) && token.code.length == 0) revert InvalidAddress();
        if (maxPerTrade == 0 || dailyLimit < maxPerTrade) revert TradeLimitExceeded();
        Policy storage current = policies[token];
        current.maxPerTrade = maxPerTrade;
        current.dailyLimit = dailyLimit;
        emit PolicyChanged(token, maxPerTrade, dailyLimit);
    }

    function executeSwap(
        address adapter,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external onlyExecutor nonReentrant returns (uint256 amountOut) {
        if (paused) revert Paused();
        if (!allowedAdapter[adapter] || adapter.code.length == 0) revert AdapterNotAllowed();
        if (!allowedOutputToken[tokenOut]) revert TokenNotAllowed();
        if (tokenIn == tokenOut || (tokenOut == address(0) && tokenIn == address(0))) revert InvalidPair();
        if (minOut == 0) revert MinimumOutputNotMet();
        if (block.timestamp > deadline) revert DeadlineExpired();
        _consumeBudget(tokenIn, amountIn);

        uint256 beforeOut = _balance(tokenOut);
        if (tokenIn == address(0)) {
            IAgentSwapAdapter(adapter).swap{value: amountIn}(tokenIn, tokenOut, fee, amountIn, minOut, deadline);
        } else {
            uint256 beforeAdapter = IERC20Minimal(tokenIn).balanceOf(adapter);
            _safeTransfer(tokenIn, adapter, amountIn);
            uint256 afterAdapter = IERC20Minimal(tokenIn).balanceOf(adapter);
            if (afterAdapter < beforeAdapter || afterAdapter - beforeAdapter != amountIn) revert TransferFailed();
            IAgentSwapAdapter(adapter).swap(tokenIn, tokenOut, fee, amountIn, minOut, deadline);
        }
        uint256 afterOut = _balance(tokenOut);
        amountOut = afterOut > beforeOut ? afterOut - beforeOut : 0;
        if (amountOut < minOut) revert MinimumOutputNotMet();
        emit SwapExecuted(adapter, tokenIn, tokenOut, amountIn, amountOut);
    }

    function withdrawNative(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function withdrawToken(address token, address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0) || token.code.length == 0) revert InvalidAddress();
        _safeTransfer(token, recipient, amount);
    }

    function _consumeBudget(address token, uint256 amount) private {
        Policy storage policy = policies[token];
        if (amount == 0 || amount > policy.maxPerTrade) revert TradeLimitExceeded();
        uint64 today = uint64(block.timestamp / 1 days);
        if (policy.day != today) { policy.day = today; policy.spentToday = 0; }
        if (policy.spentToday + amount > policy.dailyLimit) revert DailyLimitExceeded();
        policy.spentToday += amount;
    }

    function _balance(address token) private view returns (uint256) {
        return token == address(0) ? address(this).balance : IERC20Minimal(token).balanceOf(address(this));
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory result) = token.call(abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
        if (!ok || (result.length != 0 && !abi.decode(result, (bool)))) revert TransferFailed();
    }
}
