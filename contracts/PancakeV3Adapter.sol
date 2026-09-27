// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVaultFactory {
    function isVault(address candidate) external view returns (bool);
}

interface IERC20Approve {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IWrappedNative is IERC20Approve {
    function deposit() external payable;
}

interface IPancakeV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Narrow adapter for PancakeSwap v3 exact-input, single-pool swaps.
/// @dev Recipient is always the calling registered vault. Router, factory and WBNB are immutable.
contract PancakeV3Adapter {
    error UnauthorizedVault();
    error InvalidAddress();
    error InvalidPair();
    error InvalidAmount();
    error ApprovalFailed();
    error DeadlineExpired();

    IVaultFactory public immutable factory;
    IPancakeV3Router public immutable router;
    IWrappedNative public immutable wrappedNative;

    constructor(address factory_, address router_, address wrappedNative_) {
        if (factory_.code.length == 0 || router_.code.length == 0 || wrappedNative_.code.length == 0) revert InvalidAddress();
        factory = IVaultFactory(factory_);
        router = IPancakeV3Router(router_);
        wrappedNative = IWrappedNative(wrappedNative_);
    }

    modifier onlyVault() {
        if (!factory.isVault(msg.sender)) revert UnauthorizedVault();
        _;
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline
    ) external payable onlyVault returns (uint256 amountOut) {
        if (tokenIn == address(0)) {
            if (msg.value == 0 || msg.value != amountIn) revert InvalidAmount();
            wrappedNative.deposit{value: msg.value}();
            tokenIn = address(wrappedNative);
        } else if (msg.value != 0) {
            revert InvalidAmount();
        }
        amountOut = _swap(tokenIn, tokenOut, fee, amountIn, minOut, deadline, msg.sender);
    }

    function _swap(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        address recipient
    ) private returns (uint256 amountOut) {
        if (tokenIn == address(0) || tokenOut == address(0) || tokenIn == tokenOut) revert InvalidPair();
        if (amountIn == 0 || minOut == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert DeadlineExpired();
        _approve(tokenIn, address(router), 0);
        _approve(tokenIn, address(router), amountIn);
        amountOut = router.exactInputSingle(IPancakeV3Router.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: recipient,
            deadline: deadline,
            amountIn: amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0
        }));
        _approve(tokenIn, address(router), 0);
    }

    function _approve(address token, address spender, uint256 amount) private {
        (bool ok, bytes memory result) = token.call(abi.encodeCall(IERC20Approve.approve, (spender, amount)));
        if (!ok || (result.length != 0 && !abi.decode(result, (bool)))) revert ApprovalFailed();
    }
}
